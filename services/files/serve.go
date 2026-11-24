package main

import (
	"context"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Заголовки, которые сайт ставит всем ответам (next.config.ts → headers()): при отдаче мимо Next (строка nginx)
// они должны остаться. Сверяет tests/files-service.test.ts.
var siteHeaders = [][2]string{
	{"X-Content-Type-Options", "nosniff"},
	{"Referrer-Policy", "strict-origin-when-cross-origin"},
	{"X-Frame-Options", "SAMEORIGIN"},
	{"Permissions-Policy", "camera=(), microphone=(self), geolocation=()"},
}

// Один диапазон байтов: bytes=a-b, a-, -n — как SINGLE_RANGE сайта (src/shared/infrastructure/storage.ts).
var singleRange = regexp.MustCompile(`^bytes=(\d{0,15})-(\d{0,15})$`)

// Пересобираемый кэш живёт только на диске сервера, в бакет не попадает (LOCAL_ONLY сайта).
var localOnly = []string{"cache/", "chat-audio-cache/"}

type Server struct {
	Key     []byte
	Root    string // STORAGE_DIR, абсолютный
	S3      *S3    // nil — только диск
	Now     func() time.Time
	Metrics *Metrics
}

// normKey — ключ, каким он лежит в бакете; false — ключ выходит за пределы хранилища.
func (s *Server) normKey(key string) (string, string, bool) {
	if strings.HasPrefix(key, "/") {
		return "", "", false
	}
	full := filepath.Join(s.Root, filepath.FromSlash(key))
	if !strings.HasPrefix(full, s.Root+string(filepath.Separator)) {
		return "", "", false
	}
	rel, err := filepath.Rel(s.Root, full)
	if err != nil {
		return "", "", false
	}
	return filepath.ToSlash(rel), full, true
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/healthz" {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = io.WriteString(w, "ok\n")
		return
	}
	start := time.Now()
	status, n, src := s.serve(w, r)
	s.Metrics.Add(src, status, n, time.Since(start))
}

func (s *Server) serve(w http.ResponseWriter, r *http.Request) (status int, written int64, src string) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return http.StatusMethodNotAllowed, 0, "bad"
	}
	raw, ok := strings.CutPrefix(r.URL.Path, "/files/")
	// Последний сегмент после токена (имя файла для красоты) не нужен.
	raw, _, _ = strings.Cut(raw, "/")
	if !ok {
		http.NotFound(w, r)
		return http.StatusNotFound, 0, "bad"
	}
	tok, err := Decode(s.Key, raw, s.Now())
	if err != nil {
		code := http.StatusForbidden
		if errors.Is(err, errExpired) {
			code = http.StatusGone
		}
		http.Error(w, err.Error(), code)
		return code, 0, "bad"
	}
	key, full, ok := s.normKey(tok.Key)
	if !ok {
		http.NotFound(w, r)
		return http.StatusNotFound, 0, "bad"
	}
	rangeHdr := r.Header.Get("Range")
	if rangeHdr == "bytes=-" || !singleRange.MatchString(rangeHdr) {
		rangeHdr = ""
	}
	inm := r.Header.Get("If-None-Match")
	for _, h := range siteHeaders {
		w.Header().Set(h[0], h[1])
	}
	// Свой ETag маршрута (фото: от размера и ключа) — как маршрут сайта, 304 без похода в хранилище.
	if et := routeETag(tok); et != "" && rangeHdr == "" && inm == et {
		writeHead(w, tok, "", http.StatusNotModified, -1, "")
		return http.StatusNotModified, 0, "etag"
	}

	if s.S3 != nil && !isLocalOnly(key) {
		st, n, done := s.fromS3(w, r, tok, key, rangeHdr, inm)
		if done {
			return st, n, "s3"
		}
	}
	st, n := s.fromDisk(w, r, tok, full, rangeHdr, inm)
	return st, n, "disk"
}

func routeETag(tok Token) string {
	for k, v := range tok.Headers {
		if http.CanonicalHeaderKey(k) == "Etag" {
			return v
		}
	}
	return ""
}

func isLocalOnly(key string) bool {
	key = strings.TrimLeft(key, "./")
	for _, p := range localOnly {
		if strings.HasPrefix(key, p) {
			return true
		}
	}
	return false
}

// writeHead — заголовки как у ответа сайта (storedResponse): тип, Accept-Ranges, ETag источника, поверх — заголовки
// маршрута из ссылки, затем длина и диапазон.
func writeHead(w http.ResponseWriter, tok Token, etag string, status int, length int64, contentRange string) {
	h := w.Header()
	if status == http.StatusRequestedRangeNotSatisfiable {
		if contentRange != "" {
			h.Set("Content-Range", contentRange)
		}
		w.WriteHeader(status)
		return
	}
	h.Set("Content-Type", tok.Type)
	h.Set("Accept-Ranges", "bytes")
	if etag != "" {
		h.Set("ETag", etag)
	}
	for k, v := range tok.Headers {
		if allowedHeaders[http.CanonicalHeaderKey(k)] || allowedHeaders[k] {
			h.Set(k, v)
		}
	}
	if status != http.StatusNotModified {
		if length >= 0 {
			h.Set("Content-Length", strconv.FormatInt(length, 10))
		}
		if contentRange != "" {
			h.Set("Content-Range", contentRange)
		}
	}
	w.WriteHeader(status)
}

// fromS3 — объект из бакета с тем же Range / If-None-Match. done=false — объекта в бакете нет (смотрим диск).
func (s *Server) fromS3(w http.ResponseWriter, r *http.Request, tok Token, key, rangeHdr, inm string) (int, int64, bool) {
	extra := map[string]string{}
	if rangeHdr != "" {
		extra["range"] = rangeHdr
	} else if inm != "" {
		extra["if-none-match"] = inm
	}
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	res, err := s.S3.Get(ctx, key, extra, s.Now())
	if err != nil {
		log.Printf("s3 get %s: %v", key, err)
		http.Error(w, "storage unavailable", http.StatusBadGateway)
		return http.StatusBadGateway, 0, true
	}
	defer res.Body.Close()
	switch res.StatusCode {
	case http.StatusNotFound:
		return 0, 0, false
	case http.StatusOK, http.StatusPartialContent, http.StatusNotModified, http.StatusRequestedRangeNotSatisfiable:
	default:
		log.Printf("s3 get %s: status %d", key, res.StatusCode)
		http.Error(w, "storage error", http.StatusBadGateway)
		return http.StatusBadGateway, 0, true
	}
	length := int64(-1)
	if res.StatusCode == http.StatusOK || res.StatusCode == http.StatusPartialContent {
		if cl := res.Header.Get("Content-Length"); cl != "" {
			length, _ = strconv.ParseInt(cl, 10, 64)
		}
	}
	writeHead(w, tok, res.Header.Get("ETag"), res.StatusCode, length, res.Header.Get("Content-Range"))
	if r.Method == http.MethodHead || res.StatusCode != http.StatusOK && res.StatusCode != http.StatusPartialContent {
		return res.StatusCode, 0, true
	}
	n, _ := io.Copy(w, res.Body)
	return res.StatusCode, n, true
}

// diskETag — как у сайта (diskEtag в storage.ts): "<размер hex>-<время изменения, мс hex>".
func diskETag(fi os.FileInfo) string {
	return `"` + strconv.FormatInt(fi.Size(), 16) + "-" + strconv.FormatInt(fi.ModTime().UnixMilli(), 16) + `"`
}

func (s *Server) fromDisk(w http.ResponseWriter, r *http.Request, tok Token, full, rangeHdr, inm string) (int, int64) {
	f, err := os.Open(full)
	if err != nil {
		http.NotFound(w, r)
		return http.StatusNotFound, 0
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil || !fi.Mode().IsRegular() {
		http.NotFound(w, r)
		return http.StatusNotFound, 0
	}
	size := fi.Size()
	etag := diskETag(fi)
	if rangeHdr == "" && inm == etag {
		writeHead(w, tok, etag, http.StatusNotModified, -1, "")
		return http.StatusNotModified, 0
	}
	start, end, partial := int64(0), size-1, false
	if m := singleRange.FindStringSubmatch(rangeHdr); m != nil && (m[1] != "" || m[2] != "") {
		if m[1] != "" {
			start, _ = strconv.ParseInt(m[1], 10, 64)
			if m[2] != "" {
				e, _ := strconv.ParseInt(m[2], 10, 64)
				end = min(e, size-1)
			}
		} else {
			n, _ := strconv.ParseInt(m[2], 10, 64)
			start = max(0, size-n)
		}
		if start > end || start >= size {
			writeHead(w, tok, "", http.StatusRequestedRangeNotSatisfiable, -1, "bytes */"+strconv.FormatInt(size, 10))
			return http.StatusRequestedRangeNotSatisfiable, 0
		}
		partial = true
	}
	status, contentRange := http.StatusOK, ""
	if partial {
		status = http.StatusPartialContent
		contentRange = "bytes " + strconv.FormatInt(start, 10) + "-" + strconv.FormatInt(end, 10) + "/" + strconv.FormatInt(size, 10)
	}
	writeHead(w, tok, etag, status, end-start+1, contentRange)
	if r.Method == http.MethodHead {
		return status, 0
	}
	n, _ := io.Copy(w, io.NewSectionReader(f, start, end-start+1))
	return status, n
}
