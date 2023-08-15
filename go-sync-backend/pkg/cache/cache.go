package cache

import (
	"time"

	"github.com/jellydator/ttlcache/v3"
)

var CACHE = NewCache()

type Cache struct {
	c *ttlcache.Cache[string, int]
}

func NewCache() *Cache {
	cache := ttlcache.New[string, int]()
	c := &Cache{c: cache}
	go c.c.Start()
	return c
}
func (c *Cache) GetByToken(token string) int {
	if item := c.c.Get(token); item == nil {
		return 0
	} else {
		return item.Value()
	}
}
func (c *Cache) TTL(key string, value int, ttl int) {
	c.c.Set(key, value, time.Duration(ttl)*time.Second)
}
func (c *Cache) Del(key string) {
	c.c.Delete(key)
}
