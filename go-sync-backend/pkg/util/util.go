package util

import (
	"crypto/sha512"
	"encoding/hex"
	"math/rand"
	"time"
)

func Contains[T comparable](list []T, item T) bool {
	for _, o := range list {
		if o == item {
			return true
		}
	}
	return false
}
func Get[T any](m map[string]any, key string, defValue T) T {
	if _v, ok := m[key]; ok {
		switch _v.(type) {
		case float64:
			if _, ok := any(defValue).(int); ok {
				return any(int(_v.(float64))).(T)
			} else if _, ok := any(defValue).(int64); ok {
				return any(int64(_v.(float64))).(T)
			}
		case *string:
			if _v == nil {
				return any("").(T)
			}
			return any(*_v.(*string)).(T)
		case *int:
			if _v == nil {
				return any(0).(T)
			}
			return any(*_v.(*int)).(T)
		case *int64:
			if _v == nil {
				return any(int64(0)).(T)
			}
			return any(*_v.(*int64)).(T)
		}
		if v, ok := _v.(T); ok {
			return v
		}
	}
	return defValue
}

func RandomStr(l int) string {
	digits := []byte("0123456789~=+%^*/()[]{}/!@#$?|ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz")
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	result := []byte{}
	for i := 0; i < l; i++ {
		result = append(result, digits[r.Intn(len(digits))])
	}
	return string(result)
}
func Sha512(source string) string {
	return hex.EncodeToString(sha512.New().Sum([]byte(source)))
}
func Mapping[T any, V any](list []T, f func(T) V) (ret []V) {
	for _, o := range list {
		ret = append(ret, f(o))
	}
	return
}
