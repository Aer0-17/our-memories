package middleware

import (
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"our-memories-backend/utils"
)

type rateLimitBucket struct {
	count int
	reset time.Time
}

// RateLimit applies a small in-memory fixed-window limiter keyed by client IP
// and route path. It is intended for low-volume auth endpoints.
func RateLimit(window time.Duration, maxRequests int) gin.HandlerFunc {
	var mu sync.Mutex
	buckets := map[string]rateLimitBucket{}

	return func(c *gin.Context) {
		if maxRequests <= 0 || window <= 0 {
			c.Next()
			return
		}

		now := time.Now()
		key := c.ClientIP() + " " + c.FullPath()

		mu.Lock()
		if len(buckets) > 10_000 {
			for candidateKey, bucket := range buckets {
				if now.After(bucket.reset) {
					delete(buckets, candidateKey)
				}
			}
		}

		bucket := buckets[key]
		if bucket.reset.IsZero() || now.After(bucket.reset) {
			bucket = rateLimitBucket{reset: now.Add(window)}
		}
		bucket.count += 1
		buckets[key] = bucket
		limited := bucket.count > maxRequests
		mu.Unlock()

		if limited {
			utils.Error(c, 429, "Too many requests, please try again later")
			c.Abort()
			return
		}

		c.Next()
	}
}
