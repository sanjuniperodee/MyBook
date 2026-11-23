package main

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"sync"
	"time"
)

// Счётчики отдачи и память процесса — раз в 5 минут в журнал замеров сайта (perf-ГГГГ-ММ.jsonl, тот же формат, что у
// src/shared/infrastructure/perfLog.ts: kind files и mem), сводка — scripts/perf/perf-summary.mjs.
type counter struct {
	N        int            `json:"n"`
	Bytes    int64          `json:"bytes"`
	MB       float64        `json:"mb"`
	Ms       int64          `json:"ms"`
	MaxMs    int64          `json:"maxMs"`
	Statuses map[string]int `json:"statuses"`
}

type Metrics struct {
	mu  sync.Mutex
	m   map[string]*counter
	Dir string // пусто — только в stdout
}

func NewMetrics(dir string) *Metrics { return &Metrics{m: map[string]*counter{}, Dir: dir} }

func (m *Metrics) Add(src string, status int, bytes int64, d time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	name := "go:" + src
	c := m.m[name]
	if c == nil {
		c = &counter{Statuses: map[string]int{}}
		m.m[name] = c
	}
	ms := d.Milliseconds()
	c.N++
	c.Bytes += bytes
	c.Ms += ms
	c.MaxMs = max(c.MaxMs, ms)
	c.Statuses[strconv.Itoa(status)]++
}

func (m *Metrics) take() map[string]*counter {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := m.m
	m.m = map[string]*counter{}
	for _, c := range out {
		c.MB = float64(c.Bytes*10/1048576) / 10
	}
	return out
}

var vmRSS = regexp.MustCompile(`(?m)^(VmRSS|VmHWM):\s+(\d+)`)

func rssMb() (rss, peak int64) {
	b, err := os.ReadFile("/proc/self/status")
	if err != nil {
		return 0, 0
	}
	for _, m := range vmRSS.FindAllSubmatch(b, -1) {
		kb, _ := strconv.ParseInt(string(m[2]), 10, 64)
		if string(m[1]) == "VmRSS" {
			rss = kb / 1024
		} else {
			peak = kb / 1024
		}
	}
	return
}

func (m *Metrics) write(kind string, data map[string]any) {
	now := time.Now().UTC()
	data["t"] = now.Format("2006-01-02T15:04:05.000Z")
	data["kind"] = kind
	data["proc"] = "mybook-files"
	data["pid"] = os.Getpid()
	line, err := json.Marshal(data)
	if err != nil {
		return
	}
	if m.Dir == "" {
		log.Printf("%s", line)
		return
	}
	f, err := os.OpenFile(filepath.Join(m.Dir, "perf-"+now.Format("2006-01")+".jsonl"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o664)
	if err != nil {
		log.Printf("perf log: %v", err)
		return
	}
	defer f.Close()
	_, _ = f.Write(append(line, '\n'))
}

// Loop — каждые every: память и счётчики.
func (m *Metrics) Loop(every time.Duration, started time.Time) {
	tick := func() {
		var ms runtime.MemStats
		runtime.ReadMemStats(&ms)
		rss, peak := rssMb()
		m.write("mem", map[string]any{"rssMb": rss, "peakRssMb": peak, "heapMb": ms.HeapAlloc / 1048576, "heapTotalMb": ms.HeapSys / 1048576, "externalMb": 0, "buffersMb": 0, "uptimeMin": int(time.Since(started).Minutes())})
		if c := m.take(); len(c) > 0 {
			m.write("files", map[string]any{"counters": c})
		}
	}
	tick()
	for range time.Tick(every) {
		tick()
	}
}
