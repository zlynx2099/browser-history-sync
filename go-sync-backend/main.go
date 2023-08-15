package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io/ioutil"
	"net/http"
	"sync-backend/pkg/cache"
	"sync-backend/pkg/database"
	"sync-backend/pkg/util"
	"time"
)

var (
	autoRegister bool
	dsn          string
)

func auth(r *http.Request) int {
	loginToken := r.Header.Get("Authorization")
	if loginToken != "" {
		return cache.CACHE.GetByToken(loginToken)
	}
	return 0
}

func deviceAuth(r *http.Request) map[string]any {
	deviceToken := r.Header.Get("X-CSRF-TOKEN")
	if deviceToken != "" {
		return database.DATABASE.GetDeviceByToken(deviceToken)
	}
	return nil
}
func _requestJson(r *http.Request) (ret map[string]any) {
	if by, _ := ioutil.ReadAll(r.Body); len(by) == 0 {
		return nil
	} else {
		json.Unmarshal(by, &ret)
		return ret
	}
}

func JsonResponse(w http.ResponseWriter, code int, msg string, data interface{}) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
	w.Header().Set("Access-Control-Allow-Headers", "Accept,Content-Type,X-CSRF-Token,Authorization")
	w.Header().Set("Content-Type", "application/json")
	v, _ := json.Marshal(map[string]interface{}{
		"code": code,
		"msg":  msg,
		"data": data,
	})
	w.Write(v)
}

func main() {
	autoRegister = *flag.Bool("autoRegister", true, "auto create user when log in")
	dsn = *flag.String("dsn", "", "mysql database url eg: user:password@tcp(ip:port)/database")

	if database.DATABASE, _ = database.NewDB(dsn); database.DATABASE == nil {
		panic("数据库未初始化")
	}
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		JsonResponse(w, 0, "", nil)
	})
	http.HandleFunc("/auth/login", func(w http.ResponseWriter, r *http.Request) {
		j := _requestJson(r)
		username := util.Get(j, "username", "")
		password := util.Get(j, "password", "")
		expireMode := util.Get(j, "expireMode", "0")
		if username == "" || password == "" {
			JsonResponse(w, -1, "缺少参数", nil)
			return
		}
		ttl := 24 * 3600
		if expireMode == "2" {
			ttl = 7 * ttl
		} else if expireMode == "3" {
			ttl = 30 * ttl
		} else if expireMode == "4" {
			ttl = 365 * ttl
		} else if expireMode == "5" {
			ttl = 99 * 365 * ttl
		}
		u := database.DATABASE.GetUserByName(username)
		if u == nil {
			if autoRegister {
				salt := util.RandomStr(16)
				password = util.Sha512(password + salt)
				userId := database.DATABASE.InsertUser(username, salt, password)
				token := fmt.Sprintf("%d_%s", userId, util.Sha512(util.RandomStr(32)))
				cache.CACHE.TTL(token, userId, ttl)
				JsonResponse(w, 0, "", map[string]any{
					"token": token,
				})
			} else {
				JsonResponse(w, -1, "用户不存在", nil)
			}
		} else {
			userId := util.Get(u, "id", 0)
			if util.Sha512(password+util.Get(u, "salt", "")) == util.Get(u, "password", "") {
				token := fmt.Sprintf("%d_%s", userId, util.Sha512(util.RandomStr(32)))
				cache.CACHE.TTL(token, userId, ttl)
				JsonResponse(w, 0, "", map[string]any{
					"token":      token,
					"expireTime": time.Now().UnixMilli() + int64(1000*ttl),
				})
			} else {
				JsonResponse(w, -1, "密码错误", nil)
			}
		}
	})
	http.HandleFunc("/auth/authorize", func(w http.ResponseWriter, r *http.Request) {
		device := deviceAuth(r)
		if device == nil {
			JsonResponse(w, -999, "未登录", nil)
			return
		}
		u := database.DATABASE.GetUserById(util.Get(device, "user_id", 0))
		if u == nil {
			JsonResponse(w, -1, "用户不存在", nil)
			return
		}
		j := _requestJson(r)
		password := util.Get(j, "password", "")
		expireMode := util.Get(j, "expireMode", "0")
		if password == "" {
			JsonResponse(w, -1, "缺少参数", nil)
			return
		}
		ttl := 24 * 3600
		if expireMode == "2" {
			ttl = 7 * ttl
		} else if expireMode == "3" {
			ttl = 30 * ttl
		} else if expireMode == "4" {
			ttl = 365 * ttl
		} else if expireMode == "5" {
			ttl = 99 * 365 * ttl
		}
		userId := util.Get(u, "id", 0)
		if util.Sha512(password+util.Get(u, "salt", "")) == util.Get(u, "password", "") {
			token := fmt.Sprintf("%d_%s", userId, util.Sha512(util.RandomStr(32)))
			cache.CACHE.TTL(token, userId, ttl)
			JsonResponse(w, 0, "", map[string]any{
				"token":      token,
				"expireTime": time.Now().UnixMilli() + int64(1000*ttl),
			})
		} else {
			JsonResponse(w, -1, "密码错误", nil)
		}
	})
	http.HandleFunc("/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		userId := auth(r)
		if userId > 0 {
			if loginToken := r.Header.Get("Authorization"); loginToken != "" {
				cache.CACHE.Del(loginToken)
			}
			JsonResponse(w, 0, "", nil)
			return
		}
		JsonResponse(w, -999, "", nil)
	})
	http.HandleFunc("/auth/remove", func(w http.ResponseWriter, r *http.Request) {
		userId := auth(r)
		if userId > 0 {
			database.DATABASE.RemoveUser(userId)
			JsonResponse(w, 0, "", nil)
			return
		}
		JsonResponse(w, -999, "", nil)
	})
	http.HandleFunc("/device/list", func(w http.ResponseWriter, r *http.Request) {
		userId := auth(r)
		if userId > 0 {
			devices := database.DATABASE.GetDeviceList(userId)
			if devices == nil {
				devices = []map[string]any{}
			}
			JsonResponse(w, 0, "", devices)
			return
		}
		JsonResponse(w, -999, "", nil)
	})
	http.HandleFunc("/device/add", func(w http.ResponseWriter, r *http.Request) {
		userId := auth(r)
		if userId > 0 {
			j := _requestJson(r)
			device := util.Get(j, "device", "")
			if device == "" {
				JsonResponse(w, -1, "缺少参数", nil)
				return
			}
			if d := database.DATABASE.GetDeviceByName(userId, device); d != nil {
				JsonResponse(w, -1, "设备已存在", nil)
				return
			}
			deviceToken := database.DATABASE.InsertDevice(userId, device)
			JsonResponse(w, 0, "", map[string]any{
				"device_token": deviceToken,
			})
			return
		}
		JsonResponse(w, -999, "", nil)
	})
	http.HandleFunc("/urls/add", func(w http.ResponseWriter, r *http.Request) {
		device := deviceAuth(r)
		if device == nil {
			JsonResponse(w, -999, "未登录", nil)
			return
		}
		j := _requestJson(r)
		_r := util.Get(j, "r", []any{})
		record := util.Mapping[any, map[string]any](_r, func(a any) map[string]any {
			_m := a.(map[string]any)
			return _m
		})
		database.DATABASE.UpdateUrls(
			util.Get(device, "user_id", 0),
			util.Get(device, "id", 0),
			record,
		)
		JsonResponse(w, 0, "", nil)
	})
	http.HandleFunc("/urls/remove", func(w http.ResponseWriter, r *http.Request) {
		device := deviceAuth(r)
		if device == nil {
			JsonResponse(w, -999, "未登录", nil)
			return
		}
		j := _requestJson(r)
		_r := util.Get(j, "urls", []any{})
		urls := util.Mapping[any, string](_r, func(a any) string {
			return a.(string)
		})
		database.DATABASE.RemoveUrls(
			util.Get(device, "user_id", 0),
			util.Get(device, "id", 0),
			urls,
		)
	})
	http.HandleFunc("/urls/list", func(w http.ResponseWriter, r *http.Request) {
		userId := auth(r)
		if userId == 0 {
			JsonResponse(w, -999, "未登录", nil)
			return
		}
		j := _requestJson(r)
		text := util.Get(j, "text", "")
		ts := util.Get(j, "ts", int64(0))
		device_name := util.Get(j, "device", "")
		deviceId := 0
		if device_name != "" {
			device := database.DATABASE.GetDeviceByName(userId, device_name)
			deviceId = util.Get(device, "id", 0)
		}
		list := database.DATABASE.GetUrls(userId, deviceId, text, ts)
		JsonResponse(w, 0, "", list)
	})
	http.ListenAndServe("0.0.0.0:8080", nil)
}
