package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// Подписанная ссылка на файл хранилища. Выдаёт сайт (src/server/files-service.ts) после своей проверки прав: сервис
// права не проверяет, только подпись и срок. Формат: /files/<payload>.<подпись>, обе части — base64url без «=».
// Подпись — HMAC-SHA256 от строки payload ключом HMAC-SHA256(APP_SECRET, "mybook-files/v1").
type Token struct {
	Key     string            `json:"k"`           // ключ хранилища: photos/<книга>/<id>.jpg
	Type    string            `json:"t"`           // Content-Type ответа
	Expires int64             `json:"x"`           // срок, Unix-секунды
	Headers map[string]string `json:"h,omitempty"` // заголовки маршрута сайта (только из allowedHeaders)
}

const keyLabel = "mybook-files/v1"

// Заголовки, которые сайт может передать в ссылке: те же, что ставят его маршруты файлов. Остальные отбрасываются.
var allowedHeaders = map[string]bool{
	"Cache-Control":                true,
	"Content-Disposition":          true,
	"Content-Security-Policy":      true,
	"X-Content-Type-Options":       true,
	"X-Robots-Tag":                 true,
	"Cross-Origin-Resource-Policy": true,
	"ETag":                         true,
}

var (
	errBadToken = errors.New("bad token")
	errExpired  = errors.New("token expired")
)

func signingKey(appSecret string) []byte {
	m := hmac.New(sha256.New, []byte(appSecret))
	m.Write([]byte(keyLabel))
	return m.Sum(nil)
}

func sign(key []byte, payload string) string {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

// Encode — для тестов и сверки: так же подписывает сайт.
func Encode(key []byte, t Token) (string, error) {
	raw, err := json.Marshal(t)
	if err != nil {
		return "", err
	}
	payload := base64.RawURLEncoding.EncodeToString(raw)
	return payload + "." + sign(key, payload), nil
}

// Decode проверяет подпись (за постоянное время) и срок.
func Decode(key []byte, s string, now time.Time) (Token, error) {
	var t Token
	payload, sig, ok := strings.Cut(s, ".")
	if !ok || payload == "" || sig == "" || len(s) > 8192 {
		return t, errBadToken
	}
	if !hmac.Equal([]byte(sign(key, payload)), []byte(sig)) {
		return t, errBadToken
	}
	raw, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil || json.Unmarshal(raw, &t) != nil || t.Key == "" || t.Type == "" {
		return Token{}, errBadToken
	}
	if now.Unix() > t.Expires {
		return Token{}, errExpired
	}
	return t, nil
}
