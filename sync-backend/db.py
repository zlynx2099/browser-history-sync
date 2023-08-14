import sqlite3
import util
class DB:
    def __init__(self):
        self.db = sqlite3.connect("data.db")
        self.db.execute("""
        CREATE TABLE IF NOT EXISTS "users" (
            "id" INTEGER PRIMARY KEY AUTOINCREMENT,
            "username" VARCHAR,
            "salt" VARCHAR,
            "password" VARCHAR
        );""")
        self.db.execute("""
        CREATE TABLE IF NOT EXISTS "devices" (
            "id" INTEGER PRIMARY KEY AUTOINCREMENT,
            "user_id" INTEGER,
            "device_name" VARCHAR,
            "token" VARCHAR
        );""")
        self.db.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS "devices_token_index" ON "devices" (
            "token" ASC
        );""")
        self.db.execute("""
        CREATE TABLE IF NOT EXISTS "urls" (
            "id" INTEGER PRIMARY KEY AUTOINCREMENT,
            "user_id" INTEGER,
            "device_id" VARCHAR DEFAULT ',',
            "url" LONGVARCHAR,
            "title" LONGVARCHAR,
            "last_visit_time" INTEGER NOT NULL
        );""")
        self.db.execute("""
        CREATE INDEX IF NOT EXISTS "urls_url_index"
            ON "urls" (
            "url" ASC
        );""")
        self.db.execute("""
        CREATE INDEX IF NOT EXISTS "urls_user_id_index" ON "urls" (
            "user_id" ASC
        );""")
        self.db.execute("""
        CREATE INDEX IF NOT EXISTS "urls_time_index" ON "urls" (
            "last_visit_time" DESC
        );""")

    def _querymany(self,sql,params):
        c = self.db.cursor()
        c.execute(sql,params)
        return [dict(zip([col[0] for col in c.description], row)) for row in c.fetchall()]

    def _queryone(self,sql,params):
        c = self.db.cursor()
        c.execute(sql,params)
        row = c.fetchone()
        if row:
            row = dict(zip([col[0] for col in c.description], row))
        return row
    
    def _execute(self,sql,params):
        c = self.db.cursor()
        c.execute(sql,tuple(params))
        self.db.commit()
        return c.lastrowid
    
    def get_user(self,username):
        return self._queryone("select * from users where username = ? limit 1",[username])
    def get_user_by_id(self,user_id):
        return self._queryone("select * from users where id = ? limit 1",[user_id])
    
    def insert_user(self,username,salt,password):
        user_id = self._execute("insert into users (username,salt,password) values(?,?,?);",
                      [username,salt,password])
        return user_id
    
    def get_device_list(self,user_id):
        return self._querymany("select * from devices where user_id = ?",[user_id])
    
    def get_device(self,user_id,device):
        return self._queryone("select * from devices where user_id = ? and device_name = ? limit 1",[user_id,device])
    
    def get_device_by_token(self,token):
        return self._queryone("select * from devices where token = ? limit 1",[token])
        
    def insert_device(self,user_id,device_name):
        token = util.gen_password(util.random_str(32),"")
        while self.get_device_by_token(token) is not None:
            token = util.gen_password(util.random_str(32),"")
        device_id = self._execute("insert into devices (user_id,device_name,token) values(?,?,?);",[user_id,device_name,token])
        return token
    
    def _shorten_url_item(self,item):
        return {
            'u': item['url'],
            't': item['title'],
            'v': item['last_visit_time'],
        }

    
    def get_urls(self,user_id,device_id,text,ts):
        sql = "select * from urls where user_id = ?"
        params = [user_id]
        if device_id:
            sql += " and device_id like ?"
            params.append(f"%,{device_id},%")
        if text:
            if "%" in text or "_" in text:
                sql += " and (url like ? escape '\\' or title like ? escape '\\')"
                text = text.replace("\\","\\\\").replace("%","\\%").replace("_","\\_")
                params.extend([f"%{text}%",f"%{text}%"])
            else:
                sql += " and (url like ? or title like ?)"
                params.extend([f"%{text}%",f"%{text}%"])
        if ts:
            sql += " and last_visit_time < ?"
            params.append(ts)
        sql += " order by last_visit_time desc,url asc,title asc limit 200;"
        url_items = self._querymany(sql,params)
        if len(url_items) == 0:
            return []
        last_ts = url_items[-1]['last_visit_time']
        url_items = [self._shorten_url_item(u) for u in url_items if u['last_visit_time'] != last_ts]

        #fill last_visit_time items
        sql = "select * from urls where user_id = ?"
        params = [user_id]
        if device_id:
            sql += " and device_id like ?"
            params.append(f"%,{device_id},%")
        if text:
            if "%" in text or "_" in text:
                sql += " and (url like ? escape '\\' or title like ? escape '\\')"
                text = text.replace("\\","\\\\").replace("%","\\%").replace("_","\\_")
                params.extend([f"%{text}%",f"%{text}%"])
            else:
                sql += " and (url like ? or title like ?)"
                params.extend([f"%{text}%",f"%{text}%"])
        sql += " and last_visit_time = ?"
        params.append(last_ts)
        sql += " order by last_visit_time desc,url asc,title asc;"
        ext_url_items = self._querymany(sql,params)
        ext_url_items = [self._shorten_url_item(u) for u in ext_url_items]
        url_items.extend(ext_url_items)
        return url_items
    
    def update_urls(self,user_id,device_id,records):
        while len(records) > 0:
            items = []
            if len(records) <= 200:
                items = records
                records = []
            else:
                items = records[0:200]
                records = records[200:]
            sql = "select * from urls where user_id = ? and url in (%s)" % (",".join(["?" for u in items]))
            params = [user_id]
            for item in items:
                params.append(item['u'])
            url_items = self._querymany(sql,params)
            sql = f"INSERT INTO urls (id, device_id,title,last_visit_time) VALUES "
            params = []
            for item in items:
                for url_item in url_items:
                    if item['u'] == url_item['url']:
                        sql = sql + "(?,?,?,?),"
                        params.extend([
                            url_item['id'],
                            url_item['device_id'] if url_item['device_id']== f",{device_id}," else (url_item['device_id']+f"{device_id},"),
                            item['t'],
                            item['v']])
                        item['s'] = None
            if len(params) > 0:
                self._execute(f"{sql[0:-1]} ON CONFLICT (id) DO UPDATE SET device_id=excluded.device_id, title=excluded.title, last_visit_time=excluded.last_visit_time;",params)
            
            sql = f"INSERT INTO urls (user_id, device_id,url,title,last_visit_time) VALUES "
            params = []
            for item in items:
                if 's' in item:
                    continue
                sql = sql + "(?,?,?,?,?),"
                params.extend([user_id,f",{device_id},",item['u'],item['t'],item['v']])
            if len(params) > 0:
                self._execute(f"{sql[0:-1]};",params)

    def remove_urls(self,user_id,device_id,records):
        sql = "delete from urls where user_id = ? and url in (%s);" % ",".join(["?" for r in records])
        params = [user_id]
        params.extend(records)
        self._execute(sql,params)

    def remove_user(self,user_id):
        self._execute("delete from urls where user_id = ?;",[user_id])
        self._execute("delete from devices where user_id = ?;",[user_id])
        self._execute("delete from users where id = ?;",[user_id])

    def add_url(self,user_id,device_id,u,t,v):
        self.update_urls(user_id,device_id,[{"u":u,"t":t,"v":v}])
            