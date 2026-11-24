package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

var testKey = signingKey("test-secret-0123456789")
var now = time.Unix(1_800_000_000, 0)

func newServer(t *testing.T) (*Server, string) {
	t.Helper()
	root := t.TempDir()
	return &Server{Key: testKey, Root: root, Now: func() time.Time { return now }, Metrics: NewMetrics("")}, root
}

func link(t *testing.T, tok Token) string {
	t.Helper()
	if tok.Expires == 0 {
		tok.Expires = now.Unix() + 60
	}
	s, err := Encode(testKey, tok)
	if err != nil {
		t.Fatal(err)
	}
	return "/files/" + s
}

func do(s *Server, method, path string, h map[string]string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, nil)
	for k, v := range h {
		r.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	return w
}

func write(t *testing.T, root, key, data string) {
	t.Helper()
	full := filepath.Join(root, key)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte(data), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestToken(t *testing.T) {
	s, _ := Encode(testKey, Token{Key: "photos/a.jpg", Type: "image/jpeg", Expires: now.Unix() + 10})
	if tok, err := Decode(testKey, s, now); err != nil || tok.Key != "photos/a.jpg" {
		t.Fatalf("decode: %v %+v", err, tok)
	}
	if _, err := Decode(testKey, s, now.Add(11*time.Second)); err != errExpired {
		t.Fatalf("expired: %v", err)
	}
	if _, err := Decode(signingKey("other-secret-0123456789"), s, now); err != errBadToken {
		t.Fatalf("other key: %v", err)
	}
	payload, sig, _ := strings.Cut(s, ".")
	if _, err := Decode(testKey, payload+"x."+sig, now); err != errBadToken {
		t.Fatalf("tampered: %v", err)
	}
}

// Ссылку подписывает сайт (src/server/files-service.ts): вектор из tests/files-service.test.ts.
func TestTokenFromSite(t *testing.T) {
	const site = "eyJrIjoicGhvdG9zL2IxL3AxLmpwZyIsInQiOiJpbWFnZS9qcGVnIiwieCI6MTgwMDAwMDA2MCwiaCI6eyJDYWNoZS1Db250cm9sIjoicHJpdmF0ZSwgbm8tY2FjaGUifX0.Hg7UmSZAUh_rTpwZ_ac6AisHivJKvZdex7gyRvspe_E"
	tok, err := Decode(testKey, site, now)
	if err != nil || tok.Key != "photos/b1/p1.jpg" || tok.Type != "image/jpeg" || tok.Headers["Cache-Control"] != "private, no-cache" {
		t.Fatalf("site token: %v %+v", err, tok)
	}
}

func TestDisk(t *testing.T) {
	s, root := newServer(t)
	write(t, root, "support/t1/a.ogg", "0123456789")
	l := link(t, Token{Key: "support/t1/a.ogg", Type: "audio/ogg", Headers: map[string]string{"Cache-Control": "private, max-age=3600", "Content-Security-Policy": "sandbox", "Set-Cookie": "x=1"}})

	full := do(s, "GET", l, nil)
	if full.Code != 200 || full.Body.String() != "0123456789" {
		t.Fatalf("full: %d %q", full.Code, full.Body.String())
	}
	h := full.Header()
	for k, v := range map[string]string{"Content-Type": "audio/ogg", "Accept-Ranges": "bytes", "Content-Length": "10", "Cache-Control": "private, max-age=3600", "Content-Security-Policy": "sandbox", "X-Frame-Options": "SAMEORIGIN"} {
		if h.Get(k) != v {
			t.Errorf("%s = %q, want %q", k, h.Get(k), v)
		}
	}
	if h.Get("Set-Cookie") != "" {
		t.Error("header outside allow-list passed")
	}
	etag := h.Get("ETag")
	if !strings.HasPrefix(etag, `"a-`) {
		t.Errorf("etag %q", etag)
	}

	for rng, want := range map[string][3]string{"bytes=2-4": {"206", "234", "bytes 2-4/10"}, "bytes=7-": {"206", "789", "bytes 7-9/10"}, "bytes=-3": {"206", "789", "bytes 7-9/10"}, "bytes=0-1,4-5": {"200", "0123456789", ""}} {
		w := do(s, "GET", l, map[string]string{"Range": rng})
		if got := [3]string{http.StatusText(w.Code), w.Body.String(), w.Header().Get("Content-Range")}; got[1] != want[1] || got[2] != want[2] || (w.Code == 206) != (want[0] == "206") {
			t.Errorf("%s: %d %q %q", rng, w.Code, w.Body.String(), w.Header().Get("Content-Range"))
		}
	}
	if w := do(s, "GET", l, map[string]string{"Range": "bytes=50-"}); w.Code != 416 || w.Header().Get("Content-Range") != "bytes */10" {
		t.Errorf("416: %d %q", w.Code, w.Header().Get("Content-Range"))
	}
	if w := do(s, "GET", l, map[string]string{"If-None-Match": etag}); w.Code != 304 || w.Body.Len() != 0 || w.Header().Get("ETag") != etag {
		t.Errorf("304: %d", w.Code)
	}
	if w := do(s, "HEAD", l, nil); w.Code != 200 || w.Body.Len() != 0 || w.Header().Get("Content-Length") != "10" {
		t.Errorf("HEAD: %d %d", w.Code, w.Body.Len())
	}
	if w := do(s, "POST", l, nil); w.Code != 405 {
		t.Errorf("POST: %d", w.Code)
	}

	// ETag маршрута из ссылки (фото): 304 по нему, даже если файла уже нет; другой — файл целиком.
	pl := link(t, Token{Key: "photos/b/gone.jpg", Type: "image/jpeg", Headers: map[string]string{"ETag": `"route"`, "Cache-Control": "private, no-cache"}})
	if w := do(s, "GET", pl, map[string]string{"If-None-Match": `"route"`}); w.Code != 304 || w.Header().Get("ETag") != `"route"` || w.Header().Get("Cache-Control") != "private, no-cache" || w.Body.Len() != 0 {
		t.Errorf("route 304: %d %v", w.Code, w.Header())
	}
	write(t, root, "photos/b/p.jpg", "jpg")
	pl = link(t, Token{Key: "photos/b/p.jpg", Type: "image/jpeg", Headers: map[string]string{"ETag": `"route"`}})
	if w := do(s, "GET", pl, map[string]string{"If-None-Match": `"old"`}); w.Code != 200 || w.Body.String() != "jpg" || w.Header().Get("ETag") != `"route"` {
		t.Errorf("route etag miss: %d %q", w.Code, w.Header().Get("ETag"))
	}
}

func TestRejects(t *testing.T) {
	s, root := newServer(t)
	write(t, root, "photos/a.jpg", "x")
	if w := do(s, "GET", "/files/garbage", nil); w.Code != 403 {
		t.Errorf("garbage: %d", w.Code)
	}
	if w := do(s, "GET", link(t, Token{Key: "photos/a.jpg", Type: "image/jpeg", Expires: now.Unix() - 1}), nil); w.Code != 410 {
		t.Errorf("expired: %d", w.Code)
	}
	for _, key := range []string{"../etc/passwd", "/etc/passwd", "photos/../../x"} {
		if w := do(s, "GET", link(t, Token{Key: key, Type: "text/plain"}), nil); w.Code != 404 {
			t.Errorf("%s: %d", key, w.Code)
		}
	}
	if w := do(s, "GET", link(t, Token{Key: "photos/none.jpg", Type: "image/jpeg"}), nil); w.Code != 404 {
		t.Errorf("missing: %d", w.Code)
	}
	if w := do(s, "GET", "/healthz", nil); w.Code != 200 {
		t.Errorf("healthz: %d", w.Code)
	}
}

// Поддельный бакет: проверяет путь, подпись в заголовке и отвечает как S3 на Range / If-None-Match.
func fakeS3(t *testing.T, objects map[string]string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("Authorization"), "AWS4-HMAC-SHA256 Credential=id/") || r.Header.Get("X-Amz-Date") == "" {
			http.Error(w, "unsigned", 403)
			return
		}
		if r.Header.Get("Range") != "" && !strings.Contains(r.Header.Get("Authorization"), "range") {
			http.Error(w, "range not signed", 403)
			return
		}
		data, ok := objects[r.URL.EscapedPath()]
		if !ok {
			http.Error(w, "<Error><Code>NoSuchKey</Code></Error>", 404)
			return
		}
		w.Header().Set("ETag", `"md5"`)
		if r.Header.Get("If-None-Match") == `"md5"` {
			w.WriteHeader(304)
			return
		}
		if r.Header.Get("Range") == "bytes=2-4" {
			w.Header().Set("Content-Range", "bytes 2-4/10")
			w.Header().Set("Content-Length", "3")
			w.WriteHeader(206)
			_, _ = io.WriteString(w, data[2:5])
			return
		}
		w.Header().Set("Content-Length", "10")
		_, _ = io.WriteString(w, data)
	}))
}

func TestS3(t *testing.T) {
	s, root := newServer(t)
	bucket := fakeS3(t, map[string]string{"/b/mybooks/orders/o1/block.pdf": "0123456789", "/b/mybooks/photos/%D1%84%20%281%29.jpg": "0123456789"})
	defer bucket.Close()
	ep, _ := url.Parse(bucket.URL)
	s.S3 = &S3{Endpoint: ep, Region: "us-east-1", Bucket: "b", Prefix: "mybooks/", AccessKey: "id", SecretKey: "secret", Client: bucket.Client()}

	l := link(t, Token{Key: "orders/o1/block.pdf", Type: "application/pdf", Headers: map[string]string{"Content-Disposition": `attachment; filename="order-1-block.pdf"`, "Cache-Control": "private, no-store"}})
	w := do(s, "GET", l, nil)
	if w.Code != 200 || w.Body.String() != "0123456789" || w.Header().Get("ETag") != `"md5"` || w.Header().Get("Content-Length") != "10" || w.Header().Get("Content-Disposition") != `attachment; filename="order-1-block.pdf"` {
		t.Fatalf("s3 full: %d %q %v", w.Code, w.Body.String(), w.Header())
	}
	if w := do(s, "GET", l, map[string]string{"Range": "bytes=2-4"}); w.Code != 206 || w.Body.String() != "234" || w.Header().Get("Content-Range") != "bytes 2-4/10" {
		t.Errorf("s3 range: %d %q", w.Code, w.Body.String())
	}
	if w := do(s, "GET", l, map[string]string{"If-None-Match": `"md5"`}); w.Code != 304 {
		t.Errorf("s3 304: %d", w.Code)
	}
	// Кириллица, пробел и скобки в ключе — кодирование SigV4.
	if w := do(s, "GET", link(t, Token{Key: "photos/ф (1).jpg", Type: "image/jpeg"}), nil); w.Code != 200 {
		t.Errorf("escaped key: %d", w.Code)
	}
	// Нет в бакете — файл с переезда с диска; кэш — только диск, в бакет не ходит.
	write(t, root, "support/t/x.txt", "disk")
	if w := do(s, "GET", link(t, Token{Key: "support/t/x.txt", Type: "text/plain"}), nil); w.Code != 200 || w.Body.String() != "disk" {
		t.Errorf("fallback: %d %q", w.Code, w.Body.String())
	}
	write(t, root, "cache/photo-view/a.jpg", "cache")
	if w := do(s, "GET", link(t, Token{Key: "cache/photo-view/a.jpg", Type: "image/jpeg"}), nil); w.Code != 200 || w.Body.String() != "cache" {
		t.Errorf("cache: %d", w.Code)
	}
}
