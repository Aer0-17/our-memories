package handlers

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"our-memories-backend/utils"
)

type weatherPointRequest struct {
	CityID       string  `json:"cityId" binding:"required"`
	Lat          float64 `json:"lat" binding:"required"`
	Lng          float64 `json:"lng" binding:"required"`
	FallbackTemp int     `json:"fallbackTemp"`
}

type weatherInfo struct {
	CityID string `json:"cityId"`
	Temp   int    `json:"temp"`
	Kind   string `json:"kind"`
	Label  string `json:"label"`
}

type weatherCacheEntry struct {
	info      weatherInfo
	expiresAt time.Time
}

type openMeteoCurrent struct {
	Temperature2M *float64 `json:"temperature_2m"`
	WeatherCode   *int     `json:"weather_code"`
	WindSpeed10M  *float64 `json:"wind_speed_10m"`
	IsDay         *int     `json:"is_day"`
}

type openMeteoResponse struct {
	Current *openMeteoCurrent `json:"current"`
}

var (
	weatherClient       = &http.Client{Timeout: 5 * time.Second}
	weatherMu           sync.Mutex
	weatherCache        = map[string]weatherCacheEntry{}
	openMeteoURLForTest string
)

const weatherCacheTTL = 30 * time.Minute

func GetWeather(c *gin.Context) {
	var req struct {
		Points []weatherPointRequest `json:"points" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "Invalid request")
		return
	}
	if len(req.Points) == 0 {
		utils.Success(c, gin.H{"weather": map[string]weatherInfo{}})
		return
	}
	if len(req.Points) > 8 {
		utils.Error(c, http.StatusBadRequest, "Too many weather points")
		return
	}

	now := time.Now()
	result := make(map[string]weatherInfo, len(req.Points))
	for _, point := range req.Points {
		if !validWeatherPoint(point) {
			utils.Error(c, http.StatusBadRequest, "Invalid weather point")
			return
		}
		result[point.CityID] = fetchCachedWeather(point, now)
	}

	utils.Success(c, gin.H{"weather": result})
}

func validWeatherPoint(point weatherPointRequest) bool {
	return point.CityID != "" &&
		point.Lat >= -90 && point.Lat <= 90 &&
		point.Lng >= -180 && point.Lng <= 180
}

func fetchCachedWeather(point weatherPointRequest, now time.Time) weatherInfo {
	key := weatherCacheKey(point)

	weatherMu.Lock()
	if cached, ok := weatherCache[key]; ok && now.Before(cached.expiresAt) {
		weatherMu.Unlock()
		info := cached.info
		info.CityID = point.CityID
		return info
	}
	weatherMu.Unlock()

	info := fetchOpenMeteoWeather(point)
	weatherMu.Lock()
	weatherCache[key] = weatherCacheEntry{
		info:      info,
		expiresAt: now.Add(weatherCacheTTL),
	}
	weatherMu.Unlock()
	return info
}

func weatherCacheKey(point weatherPointRequest) string {
	return fmt.Sprintf("%.3f,%.3f", point.Lat, point.Lng)
}

func fetchOpenMeteoWeather(point weatherPointRequest) weatherInfo {
	req, err := http.NewRequest(http.MethodGet, openMeteoURL(point.Lat, point.Lng), nil)
	if err != nil {
		return fallbackWeather(point)
	}
	resp, err := weatherClient.Do(req)
	if err != nil {
		return fallbackWeather(point)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fallbackWeather(point)
	}

	var data openMeteoResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil || data.Current == nil {
		return fallbackWeather(point)
	}

	current := data.Current
	temp := point.FallbackTemp
	if current.Temperature2M != nil {
		temp = int(math.Round(*current.Temperature2M))
	}
	code := 0
	if current.WeatherCode != nil {
		code = *current.WeatherCode
	}
	windSpeed := 0.0
	if current.WindSpeed10M != nil {
		windSpeed = *current.WindSpeed10M
	}
	isDay := true
	if current.IsDay != nil {
		isDay = *current.IsDay == 1
	}
	kind, label := mapWeatherKind(code, windSpeed, isDay)
	return weatherInfo{
		CityID: point.CityID,
		Temp:   temp,
		Kind:   kind,
		Label:  label,
	}
}

func openMeteoURL(lat, lng float64) string {
	if openMeteoURLForTest != "" {
		return openMeteoURLForTest
	}
	return fmt.Sprintf(
		"https://api.open-meteo.com/v1/forecast?latitude=%g&longitude=%g&current=temperature_2m,weather_code,wind_speed_10m,is_day&timezone=Asia%%2FShanghai",
		lat,
		lng,
	)
}

func fallbackWeather(point weatherPointRequest) weatherInfo {
	temp := point.FallbackTemp
	if temp == 0 {
		temp = 24
	}
	return weatherInfo{
		CityID: point.CityID,
		Temp:   temp,
		Kind:   "partly",
		Label:  "多云",
	}
}

func mapWeatherKind(code int, windSpeed float64, isDay bool) (string, string) {
	if windSpeed >= 38 {
		return "wind", "大风"
	}
	if code == 0 {
		if isDay {
			return "sunny", "晴"
		}
		return "night-clear", "夜晴"
	}
	if code == 1 || code == 2 {
		if isDay {
			return "partly", "多云"
		}
		return "night-partly", "夜多云"
	}
	if code == 3 {
		return "cloudy", "阴"
	}
	if code == 45 || code == 48 {
		return "fog", "大雾"
	}
	if code == 51 || code == 53 || code == 55 || code == 56 || code == 57 || code == 61 || code == 80 {
		return "light-rain", "小雨"
	}
	if code == 63 || code == 81 {
		return "moderate-rain", "中雨"
	}
	if code == 65 || code == 82 {
		return "heavy-rain", "大雨"
	}
	if code == 66 || code == 67 {
		return "sleet", "雨夹雪"
	}
	if code == 71 || code == 77 || code == 85 {
		return "snow", "小雪"
	}
	if code == 73 {
		return "moderate-snow", "中雪"
	}
	if code == 75 || code == 86 {
		return "heavy-snow", "大雪"
	}
	if code == 95 || code == 96 || code == 99 {
		return "thunder", "雷雨"
	}
	return "cloudy", "阴"
}
