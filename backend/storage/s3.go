package storage

import (
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/credentials"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	"our-memories-backend/config"
)

type S3Storage struct {
	cfg             *config.Config
	client          *s3.S3
	pathStyleClient *s3.S3
}

func NewS3Storage(cfg *config.Config) *S3Storage {
	if cfg == nil {
		cfg = config.Get()
	}

	store := &S3Storage{cfg: cfg}
	if cfg.S3Endpoint != "" {
		store.client = newS3Client(cfg, false)
		store.pathStyleClient = newS3Client(cfg, true)
	}
	return store
}

func (s *S3Storage) config() *config.Config {
	if s != nil && s.cfg != nil {
		return s.cfg
	}
	return config.Get()
}

func newS3Client(cfg *config.Config, forcePathStyle bool) *s3.S3 {
	sess := session.Must(session.NewSession(&aws.Config{
		Endpoint:         aws.String(cfg.S3Endpoint),
		Region:           aws.String(cfg.S3Region),
		Credentials:      credentials.NewStaticCredentials(cfg.S3AccessKeyID, cfg.S3SecretAccessKey, ""),
		S3ForcePathStyle: aws.Bool(forcePathStyle),
	}))
	return s3.New(sess)
}

// Enabled reports whether object storage is configured.
func (s *S3Storage) Enabled() bool { return s != nil && s.client != nil }
