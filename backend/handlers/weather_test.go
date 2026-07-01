package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestMapWeatherKind(t *testing.T) {
	tests := []struct {
		name      string
		code      int
		windSpeed float64
		isDay     bool
		wantKind  string
		wantLabel string
	}{
		{name: "sunny", code: 0, isDay: true, wantKind: "sunny", wantLabel: "晴"},
		{name: "night clear", code: 0, isDay: false, wantKind: "night-clear", wantLabel: "夜晴"},
		{name: "heavy rain", code: 82, isDay: true, wantKind: "heavy-rain", wantLabel: "大雨"},
		{name: "snow", code: 71, isDay: true, wantKind: "snow", wantLabel: "小雪"},
		{name: "wind", code: 0, windSpeed: 38, isDay: true, wantKind: "wind", wantLabel: "大风"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotKind, gotLabel := mapWeatherKind(tt.code, tt.windSpeed, tt.isDay)
			if gotKind != tt.wantKind || gotLabel != tt.wantLabel {
				t.Fatalf("mapWeatherKind() = %q, %q; want %q, %q", gotKind, gotLabel, tt.wantKind, tt.wantLabel)
			}
		})
	}
}

func TestFetchCachedWeatherCachesByCoordinates(t *testing.T) {
	previousClient := weatherClient
	previousCache := weatherCache
	defer func() {
		weatherClient = previousClient
		weatherCache = previousCache
	}()

	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requestCount++
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"current":{"temperature_2m":19.6,"weather_code":3,"wind_speed_10m":4,"is_day":1}}`))
	}))
	defer server.Close()

	weatherClient = server.Client()
	weatherCache = map[string]weatherCacheEntry{}
	previousOpenMeteoURL := openMeteoURLForTest
	openMeteoURLForTest = server.URL
	defer func() { openMeteoURLForTest = previousOpenMeteoURL }()

	point := weatherPointRequest{CityID: "xuzhou", Lat: 34.2, Lng: 117.2, FallbackTemp: 24}
	first := fetchCachedWeather(point, time.Now())
	second := fetchCachedWeather(point, time.Now().Add(time.Minute))

	if requestCount != 1 {
		t.Fatalf("requestCount = %d; want 1", requestCount)
	}
	if first.Temp != 20 || second.Temp != 20 || first.Kind != "cloudy" || second.Kind != "cloudy" {
		t.Fatalf("unexpected weather: %#v %#v", first, second)
	}
}
