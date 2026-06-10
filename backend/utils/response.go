package utils

import "github.com/gin-gonic/gin"

func Success(c *gin.Context, data interface{}) {
	c.JSON(200, data)
}

func Error(c *gin.Context, code int, message string) {
	c.JSON(code, gin.H{"error": message})
}
