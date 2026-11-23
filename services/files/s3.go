package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

// Клиент S3 на одну операцию — GET объекта с подписью AWS SigV4, адресация path-style. Тот же порядок, что у сайта
// (src/shared/infrastructure/s3.ts): проверен на PS Cloud Object Storage (object.pscloud.io).
type S3 struct {
	Endpoint  *url.URL
	Region    string
	Bucket    string
	AccessKey string
	SecretKey string
	Prefix    string // «mybooks/»: бакет общий для нескольких проектов
	Client    *http.Client
}

// awsEscape — кодирование SigV4: всё, кроме A-Z a-z 0-9 - _ . ~ (как encodeURIComponent и ещё !'()*).
func awsEscape(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-' || c == '_' || c == '.' || c == '~' {
			b.WriteByte(c)
		} else {
			b.WriteString("%" + strings.ToUpper(hex.EncodeToString([]byte{c})))
		}
	}
	return b.String()
}

func (s *S3) objectPath(key string) string {
	parts := strings.Split(s.Prefix+key, "/")
	for i, p := range parts {
		parts[i] = awsEscape(p)
	}
	return "/" + awsEscape(s.Bucket) + "/" + strings.Join(parts, "/")
}

func hmacSHA(key []byte, data string) []byte {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(data))
	return m.Sum(nil)
}

// emptySHA — sha256 пустого тела: GET без тела, как подписывает сайт.
const emptySHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

// Get — объект потоком; extra (range, if-none-match) уходят в бакет и входят в подпись.
func (s *S3) Get(ctx context.Context, key string, extra map[string]string, now time.Time) (*http.Response, error) {
	pathname := s.objectPath(key)
	amzDate := now.UTC().Format("20060102T150405Z")
	day := amzDate[:8]
	headers := map[string]string{"host": s.Endpoint.Host, "x-amz-content-sha256": emptySHA, "x-amz-date": amzDate}
	for k, v := range extra {
		headers[strings.ToLower(k)] = strings.TrimSpace(v)
	}
	names := make([]string, 0, len(headers))
	for k := range headers {
		names = append(names, k)
	}
	sort.Strings(names)
	var canonHeaders strings.Builder
	for _, n := range names {
		canonHeaders.WriteString(n + ":" + headers[n] + "\n")
	}
	signed := strings.Join(names, ";")
	canonical := strings.Join([]string{"GET", pathname, "", canonHeaders.String(), signed, emptySHA}, "\n")
	scope := day + "/" + s.Region + "/s3/aws4_request"
	sum := sha256.Sum256([]byte(canonical))
	toSign := strings.Join([]string{"AWS4-HMAC-SHA256", amzDate, scope, hex.EncodeToString(sum[:])}, "\n")
	kDate := hmacSHA([]byte("AWS4"+s.SecretKey), day)
	kSigning := hmacSHA(hmacSHA(hmacSHA(kDate, s.Region), "s3"), "aws4_request")
	signature := hex.EncodeToString(hmacSHA(kSigning, toSign))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.Endpoint.Scheme+"://"+s.Endpoint.Host+pathname, nil)
	if err != nil {
		return nil, err
	}
	// Путь уже закодирован по правилам SigV4 — отправляем ровно его.
	req.URL.RawPath = pathname
	for _, n := range names {
		if n != "host" {
			req.Header.Set(n, headers[n])
		}
	}
	req.Header.Set("Authorization", "AWS4-HMAC-SHA256 Credential="+s.AccessKey+"/"+scope+", SignedHeaders="+signed+", Signature="+signature)
	return s.Client.Do(req)
}
