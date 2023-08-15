package database

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"sync-backend/pkg/util"

	_ "github.com/go-sql-driver/mysql"
)

var DATABASE *DB

type DB struct {
	d *sql.DB
}

func NewDB(dsn string) (*DB, error) {
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(5)
	ret := &DB{d: db}
	ret.init()
	return ret, nil
}
func (db *DB) init() {
	db.d.Exec(`
	CREATE TABLE IF NOT EXISTS users  (
		id int NOT NULL AUTO_INCREMENT,
		username varchar(50) NULL,
		salt varchar(16) NULL,
		password varchar(512) NULL,
		PRIMARY KEY (id)
	  );`)
	db.d.Exec(`
	CREATE TABLE IF NOT EXISTS devices (
		id int NOT NULL AUTO_INCREMENT,
		user_id int NULL,
		device_name varchar(50) NULL,
		token varchar(512) NULL,
		PRIMARY KEY (id),
		INDEX token_idx(token) USING HASH
	  );`)
	db.d.Exec(`
	CREATE TABLE IF NOT EXISTS urls (
		id int NOT NULL AUTO_INCREMENT,
		user_id int NULL,
		device_id varchar(255) NULL,
		url longtext NULL,
		title text NULL,
		last_visit_time BIGINT NULL,
		status int,
		PRIMARY KEY (id),
		INDEX url_idx(url(256)) USING BTREE,
		INDEX user_id_idx(user_id) USING BTREE,
		INDEX last_visit_time_idx(last_visit_time) USING BTREE,
		INDEX status_idx(status) USING BTREE
	  );`)
}
func (db *DB) _execute(sql string, params []any) int {
	stmt, err := db.d.Prepare(sql)
	if err != nil {
		log.Println(err.Error())
		return 0
	}
	result, err := stmt.Exec(params...)
	if err != nil {
		log.Println(err.Error())
		return 0
	}
	lastId, _ := result.LastInsertId()
	return int(lastId)
}
func (db *DB) _querymany(sql string, params []any) (ret []map[string]any) {
	stmt, err := db.d.Prepare(sql)
	if err != nil {
		log.Println(err.Error())
		return
	}
	rows, err := stmt.Query(params...)
	if err != nil {
		log.Println(err.Error())
		return
	}
	colTypes, _ := rows.ColumnTypes()
	for rows.Next() {
		// Scan needs an array of pointers to the values it is setting
		// This creates the object and sets the values correctly
		values := make([]interface{}, len(colTypes))
		dest := map[string]any{}
		for i, column := range colTypes {
			var v interface{}
			switch column.DatabaseTypeName() {
			case "TEXT", "VARCHAR":
				v = new(string)
			case "INT":
				v = new(int)
			case "BIGINT":
				v = new(int64)
			}
			dest[column.Name()] = v
			values[i] = v
		}
		rows.Scan(values...)
		ret = append(ret, dest)
	}
	if err := rows.Err(); err != nil {
		log.Println(err.Error())
		return
	}
	return ret
}
func (db *DB) GetUserByName(username string) map[string]any {
	rows := db._querymany("select * from users where username = ? limit 1", []any{username})
	if len(rows) == 0 {
		return nil
	}
	return rows[0]
}

func (db *DB) GetUserById(id int) map[string]any {
	rows := db._querymany("select * from users where id = ? limit 1", []any{id})
	if len(rows) == 0 {
		return nil
	}
	return rows[0]
}

func (db *DB) InsertUser(username string, salt string, password string) int {
	return db._execute("insert into users (username,salt,password) values(?,?,?);", []any{username, salt, password})
}
func (db *DB) GetDeviceList(userId int) []map[string]any {
	return db._querymany("select * from devices where user_id = ?", []any{userId})
}
func (db *DB) GetDeviceByName(userId int, name string) map[string]any {
	rows := db._querymany("select * from devices where user_id = ? and device_name = ? limit 1", []any{userId, name})
	if len(rows) == 0 {
		return nil
	}
	return rows[0]
}
func (db *DB) GetDeviceByToken(token string) map[string]any {
	rows := db._querymany("select * from devices where token = ? limit 1", []any{token})
	if len(rows) == 0 {
		return nil
	}
	return rows[0]
}
func (db *DB) InsertDevice(userId int, deviceName string) string {
	token := util.Sha512(util.RandomStr(32))
	for db.GetDeviceByToken(token) != nil {
		token = util.Sha512(util.RandomStr(32))
	}
	db._execute("insert into devices (user_id,device_name,token) values(?,?,?);", []any{userId, deviceName, token})
	return token
}
func _shortenUrlItems(list []map[string]any, f func(map[string]any) bool) (ret []map[string]any) {
	for _, o := range list {
		if f != nil {
			if !f(o) {
				continue
			}
		}
		ret = append(ret, map[string]any{
			"u": util.Get(o, "url", ""),
			"t": util.Get(o, "title", ""),
			"v": util.Get(o, "last_visit_time", int64(0)),
			"s": util.Get(o, "status", 0),
		})
	}
	return ret
}
func (db *DB) GetUrls(userId int, deviceId int, text string, ts int64) (ret []map[string]any) {
	sql := "select * from urls where user_id = ?"
	params := []any{userId}
	if deviceId > 0 {
		sql += " and find_in_set(device_id,?)"
		params = append(params, deviceId)
	}
	if ts > 0 {
		sql += " and last_visit_time < ?"
		params = append(params, ts)
	}
	if text != "" {
		text = strings.ReplaceAll(text, "%", "\\%")
		text = strings.ReplaceAll(text, "'", "\\'")
		text = strings.ReplaceAll(text, "_", "\\_")
		text = strings.ReplaceAll(text, "/", "\\/")
		sql += " and (url like concat('%',?,'%') or title like concat('%',?,'%'))"
		params = append(params, text, text)
	}
	sql += " order by last_visit_time desc,url asc,title asc limit 200;"
	urlItems := db._querymany(sql, params)
	if len(urlItems) == 0 {
		return []map[string]any{}
	}
	lastTs := util.Get(urlItems[len(urlItems)-1], "last_visit_time", int64(0))
	urlItems = _shortenUrlItems(urlItems, func(m map[string]any) bool {
		return util.Get(m, "last_visit_time", int64(0)) != lastTs
	})
	//
	sql = "select * from urls where user_id = ?"
	params = []any{userId}
	if deviceId > 0 {
		sql += " and find_in_set(device_id,?)"
		params = append(params, deviceId)
	}
	if text != "" {
		sql += " and (url like concat('%',?,'%') or title like concat('%',?,'%'))"
		params = append(params, text, text)
	}
	sql += " and last_visit_time = ?"
	params = append(params, lastTs)
	sql += " order by last_visit_time desc,url asc,title asc;"
	extraUrlItems := db._querymany(sql, params)
	extraUrlItems = _shortenUrlItems(extraUrlItems, nil)
	urlItems = append(urlItems, extraUrlItems...)
	return urlItems
}
func (db *DB) UpdateUrls(userId int, deviceId int, records []map[string]any) {
	for len(records) > 0 {
		var items []map[string]any
		if len(records) <= 200 {
			items = records
			records = []map[string]any{}
		} else {
			items = records[0:200]
			records = records[200:]
		}
		sql := fmt.Sprintf("select * from urls where user_id = ? and url in (%s)",
			strings.Join(util.Mapping[map[string]any, string](items, func(s map[string]any) string {
				return "?"
			}), ","))
		params := []any{userId}
		for _, o := range items {
			params = append(params, util.Get(o, "u", ""))
		}
		urlItems := db._querymany(sql, params)
		sql = "INSERT INTO urls (id, device_id,title,last_visit_time,status) VALUES "
		params = []any{}
		for _, o := range items {
			for _, uo := range urlItems {
				if util.Get(o, "u", "") == util.Get(uo, "url", "") {
					sql += "(?,?,?,?,?),"
					newDeviceId := util.Get(uo, "device_id", "")
					if !util.Contains(strings.Split(newDeviceId, ","), fmt.Sprintf("%d", deviceId)) {
						newDeviceId = newDeviceId + fmt.Sprintf(",%d", deviceId)
					}
					params = append(params, util.Get(uo, "id", 0), newDeviceId, util.Get(o, "t", ""), util.Get(o, "v", int64(0)), util.Get(o, "s", 0))
					o["s"] = -1
				}
			}
		}
		if len(params) > 0 {
			sql = sql[0:len(sql)-1] + " ON duplicate key UPDATE device_id=values(device_id), title=values(title), last_visit_time=values(last_visit_time), status = values(status);"
			db._execute(sql, params)
		}
		sql = "INSERT INTO urls (user_id, device_id,url,title,last_visit_time,status) VALUES "
		params = []any{}
		for _, o := range items {
			s := util.Get(o, "s", 0)
			if s == -1 {
				continue
			}
			sql += "(?,?,?,?,?,?),"
			params = append(params, userId, fmt.Sprintf("%d", deviceId), util.Get(o, "u", ""), util.Get(o, "t", ""), util.Get(o, "v", int64(0)), util.Get(o, "s", 0))
		}
		if len(params) > 0 {
			db._execute(sql[0:len(sql)-1]+";", params)
		}
	}
}
func (db *DB) RemoveUrls(userId int, deviceId int, urls []string) {
	sql := fmt.Sprintf("delete from urls where user_id = ? and url in (%s);",
		strings.Join(util.Mapping[string, string](urls, func(s string) string { return "?" }), ","),
	)
	params := []any{userId}
	for _, u := range urls {
		params = append(params, u)
	}
	db._execute(sql, params)
}
func (db *DB) RemoveUser(userId int) {
	db._execute("delete from urls where user_id = ?;", []any{userId})
	db._execute("delete from devices where user_id = ?;", []any{userId})
	db._execute("delete from users where id = ?;", []any{userId})
}
