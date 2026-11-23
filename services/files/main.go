// mybook-files — отдача файлов хранилища MyBooks (S3 PS Cloud и диск STORAGE_DIR) по подписанной ссылке сайта:
// Range, ETag, кэш-заголовки и CSP маршрута, без чтения файла в память. Права проверяет сайт, сервис — только подпись
// и срок ссылки (token.go). Пилот G3 плана docs/microservices/10-go-plan-2026-11-24.md, ADR 0011.
//
// Запуск: mybook-files -env /home/srv/mybook/.env  (PM2: deploy/ecosystem.config.cjs, приложение mybook-files).
// Слушает 127.0.0.1:FILES_PORT (3050). Снаружи — через тот же домен: сайт переписывает /files/* на сервис
// (next.config.ts), а строка nginx из docs/microservices/06-operations.md пускает /files/ мимо Next.
package main

import (
	"bufio"
	"context"
	"flag"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

var version = "dev"

// loadEnv — KEY=VALUE из файла .env сайта (как node --env-file): комментарии, export, кавычки. Переменные процесса главнее.
func loadEnv(path string) map[string]string {
	env := map[string]string{}
	if path != "" {
		f, err := os.Open(path)
		if err != nil {
			log.Fatalf("env file: %v", err)
		}
		defer f.Close()
		sc := bufio.NewScanner(f)
		for sc.Scan() {
			line := strings.TrimSpace(sc.Text())
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			line = strings.TrimPrefix(line, "export ")
			k, v, ok := strings.Cut(line, "=")
			if !ok {
				continue
			}
			v = strings.TrimSpace(v)
			if len(v) >= 2 && (v[0] == '"' && v[len(v)-1] == '"' || v[0] == '\'' && v[len(v)-1] == '\'') {
				v = v[1 : len(v)-1]
			}
			env[strings.TrimSpace(k)] = v
		}
	}
	for _, kv := range os.Environ() {
		if k, v, ok := strings.Cut(kv, "="); ok {
			env[k] = v
		}
	}
	return env
}

func or(v, def string) string {
	if v == "" {
		return def
	}
	return v
}

func main() {
	envFile := flag.String("env", "", "файл .env сайта (APP_SECRET, STORAGE_DIR, S3_*)")
	flag.Parse()
	env := loadEnv(*envFile)

	secret := env["APP_SECRET"]
	if len(secret) < 16 {
		log.Fatal("APP_SECRET не задан")
	}
	root, err := filepath.Abs(or(env["STORAGE_DIR"], "./storage"))
	if err != nil {
		log.Fatal(err)
	}
	srv := &Server{Key: signingKey(secret), Root: root, Now: time.Now}

	if env["S3_BUCKET"] != "" && env["S3_ACCESS_KEY_ID"] != "" && env["S3_SECRET_ACCESS_KEY"] != "" {
		ep, err := url.Parse(or(env["S3_ENDPOINT"], "https://object.pscloud.io"))
		if err != nil {
			log.Fatalf("S3_ENDPOINT: %v", err)
		}
		prefix, ok := env["S3_PREFIX"]
		if !ok {
			prefix = "mybooks/"
		}
		srv.S3 = &S3{
			Endpoint: ep, Region: or(env["S3_REGION"], "us-east-1"), Bucket: env["S3_BUCKET"], Prefix: prefix,
			AccessKey: env["S3_ACCESS_KEY_ID"], SecretKey: env["S3_SECRET_ACCESS_KEY"],
			Client: &http.Client{Transport: &http.Transport{
				Proxy:                 http.ProxyFromEnvironment,
				DialContext:           (&net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
				TLSHandshakeTimeout:   10 * time.Second,
				ResponseHeaderTimeout: 30 * time.Second,
				MaxIdleConnsPerHost:   16,
				IdleConnTimeout:       90 * time.Second,
				// Объект отдаётся как лежит в бакете: без прозрачной распаковки gzip.
				DisableCompression: true,
			}},
		}
	}

	perfDir := ""
	if env["PERF_LOG"] != "off" {
		perfDir = or(env["PERF_LOG_DIR"], filepath.Join(filepath.Dir(root), "mybook-logs"))
		if err := os.MkdirAll(perfDir, 0o775); err != nil {
			log.Printf("perf log dir: %v", err)
			perfDir = ""
		}
	}
	srv.Metrics = NewMetrics(perfDir)
	go srv.Metrics.Loop(5*time.Minute, time.Now())

	addr := net.JoinHostPort(or(env["FILES_HOST"], "127.0.0.1"), or(env["FILES_PORT"], "3050"))
	hs := &http.Server{Addr: addr, Handler: srv, ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 120 * time.Second}
	go func() {
		stop := make(chan os.Signal, 1)
		signal.Notify(stop, syscall.SIGTERM, syscall.SIGINT)
		<-stop
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_ = hs.Shutdown(ctx)
	}()
	s3 := "нет"
	if srv.S3 != nil {
		s3 = srv.S3.Endpoint.Host + "/" + srv.S3.Bucket + "/" + srv.S3.Prefix
	}
	log.Printf("mybook-files %s: %s, хранилище %s, S3 %s", version, addr, root, s3)
	if err := hs.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
