from flask import Flask,request,Request
from flask import g
from flask_cors import CORS
from flask_json import FlaskJSON, JsonError, json_response, as_json
from db import DB
from expiring_dict import ExpiringDict
import util
from environs import Env
import json

app = Flask(__name__)
CORS(app)
app.config['JSON_ADD_STATUS'] = False
app.config['JSON_JSONP_OPTIONAL'] = False
env = Env()
cache = ExpiringDict() # 1 day cache

def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = DB()
    return db

def res(code,msg,data=None):
    return {
        "code":code,
        "msg":msg,
        "data":data
    }
UNAUTHORIZED = res(-999,"未登录")

def auth(req: Request):
    login_token = req.headers.get("Authorization")
    if login_token is not None and cache.get(login_token) is not None:
        return cache.get(login_token)
    return None

def device_auth(req: Request):
    device_token = req.headers.get("X-CSRF-Token")
    if device_token is not None and not util.is_empty(device_token):
        device = get_db().get_device_by_token(device_token)
        if device is not None:
            return device
    return None

@app.post('/auth/login')
@as_json
def authLogin():
    j = request.json
    username = util.get(j,'username',None)
    password = util.get(j,'password',None)
    if util.is_empty(username) or util.is_empty(password):
        return res(-1,"缺少必要参数")
    username = str(username)
    password = str(password)
    u = get_db().get_user(username)
    if u is None:
        #自动注册
        if env.bool('AUTO_REGISTER'):
            salt = util.random_str(16)
            password = util.gen_password(password,salt)
            user_id = get_db().insert_user(username,salt,password)
            token = str(user_id) + "_" + util.gen_password(util.gen_key(32),"")
            cache.ttl(token,user_id,60*60*24)
            return res(0,"",{"token":token})
        else:
            return res(-1,"用户不存在")
    else:
        if util.gen_password(password,u['salt']) == u['password']:
            token = str(u['id']) + "_" + util.gen_password(util.gen_key(32),"")
            cache.ttl(token,u['id'],60*60*24)
            return res(0,"",{"token":token})
        return res(-1,"密码错误")
    
@app.post('/auth/logout')
@as_json
def authLogout():
    user_id = auth(request)
    if user_id:
        login_token = request.headers.get("Authorization")
        if login_token is not None and cache.get(login_token) is not None:
            del cache[login_token]
    return res(0,"")

@app.post('/auth/remove')
@as_json
def authRemove():
    user_id = auth(request)
    if user_id:
        get_db().remove_user(user_id)
        return res(0,"")
    return res(-1,"无效参数")
    
@app.post('/device/list')
@as_json
def device_list():
    user_id = auth(request)
    if not user_id:
        return UNAUTHORIZED
    devices = get_db().get_device_list(user_id)
    return res(0,"",devices)

@app.post('/device/add')
@as_json
def device_add():
    user_id = auth(request)
    if not user_id:
        return UNAUTHORIZED
    j = request.json
    device = util.get(j,'device',None)
    if util.is_empty(device):
        return res(-1,"缺少必要参数")
    device = str(device)
    if get_db().get_device(user_id,device):
        return res(-1,"设备已存在")
    device_token = get_db().insert_device(user_id,device)
    return res(0,"",{"device_token":device_token})

@app.post("/urls/add")
@as_json
def urls_add():
    """
    records:[{"u":url,"t":title,"v":visitTime,"s":status}]
    """
    device = device_auth(request)
    if not device:
        return UNAUTHORIZED
    j = request.json
    get_db().update_urls(device['user_id'],device['id'],j)
    return res(0,"")

@app.post("/urls/remove")
@as_json
def urls_remove():
    """
    urls:[u1,u2,...]
    """
    device = device_auth(request)
    if not device:
        return UNAUTHORIZED
    j = request.json
    urls = util.get(j,'urls',None)
    get_db().remove_urls(device['user_id'],device['id'],urls)
    return res(0,"")

@app.post("/urls/list")
@as_json
def urls_list():
    """
    text:"",ts:""
    """
    device = device_auth(request)
    if not device:
        return UNAUTHORIZED
    j = request.json
    text = util.get(j,"text",None)
    ts = util.get(j,'ts',None)
    device_name = util.get(j,"device_name",None)
    user_id = device['user_id']
    device_id = None
    if device_name and len(device_name) > 0:
        device = get_db().get_device(device['user_id'],device_name)
        device_id = device['id']
    data = get_db().get_urls(user_id,device_id,text,ts)
    return res(0,"",data)
app.run("0.0.0.0",8080,debug=True)