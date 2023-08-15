class PageUtil {
    constructor(chromeApi){
        this.chromeApi = chromeApi
    }
    async logout(){
        let config = await this.chromeApi.getConfig()
        delete config['auth']
        delete config['auth_expired']
        delete config['device']
        delete config['device_token']
        await this.chromeApi.saveConfig(config)
    }
    async _fetch(url,auth,token,body,timeout=5000){
        var controller,id = null;
        if (timeout){
            controller = new AbortController();
            id = setTimeout(() => controller.abort(), timeout);
        }
        let headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
        if (auth){
            headers['Authorization'] = auth
        }
        if (token){
            headers['X-CSRF-Token'] = token
        }
        try{
            let res = await fetch(url,{
                method:"POST",
                headers: headers,
                body:JSON.stringify(body),
                signal: timeout?controller.signal:null,
            })
            if (timeout){
                clearTimeout(id);
            }
            try{
                return await res.json()
            }catch (e){
                return {"code":-1000,"msg":"解析报文失败"}
            }
        }
        catch (e){
            return {"code":-9999,"msg":"连接失败"}
        }
    }
    async check(){
        let config = await this.chromeApi.getConfig()
        return await this._fetch(config['host'],null,null,{})
    }
    async login(host,username,password,expireMode){
        let j = await this._fetch(host+"/auth/login",null,null,{
            "username":username,
            "password":password,
            "expireMode":expireMode
        })
        if (j && j.code == 0){
            let config = await this.chromeApi.getConfig()
            config['host'] = host;
            config['username'] = username;
            config['auth'] = j.data.token
            config['auth_expired'] = j.data.expireTime
            config['expireMode'] = expireMode
            await this.chromeApi.saveConfig(config)
        }
        return j
    }
    async authorize(password,expireMode) {
        let config = await this.chromeApi.getConfig()
        let j = await this._fetch(config['host']+"/auth/authorize",null,config['device_token']??null,{
            "password":password,
            "expireMode":expireMode
        })
        if (j && j.code == 0){
            let config = await this.chromeApi.getConfig()
            config['auth'] = j.data.token
            config['auth_expired'] = j.data.expireTime
            config['expireMode'] = expireMode
            await this.chromeApi.saveConfig(config)
        }
        return j
    }
    async deviceList(){
        let config = await this.chromeApi.getConfig()
        return await this._fetch(config['host']+"/device/list",config['auth']??null,null,{})
    }
    async addDevice(device){
        let config = await this.chromeApi.getConfig()
        let j = await this._fetch(config['host']+"/device/add",config['auth']??null,null,{
            "device":device,
        })
        return j
    }
    async chooseDevice(device,token){
        let config = await this.chromeApi.getConfig()
        config['device'] = device
        config['device_token'] = token;
        this.chromeApi.saveConfig(config)
    }
    async searchHistory(text,ts,device){
        let config = await this.chromeApi.getConfig()
        return await this._fetch(config['host']+"/urls/list",config['auth']??null,null,{
            "text":text,
            "ts":ts,
            "device":device
        })
    }
    async importAllHistory(){
        let data = await this.chromeApi.searchAllHistroy();
        let records = [];
        for (var d of data){
          records.push({
            "t": d.title,
            "u": d.url,
            "v": parseInt(d.lastVisitTime/1000)
          })
        }
        return await this.addHistorys(records)
    }    
    async addHistory(url,title,lastVisitTime,status){
        let config = await this.chromeApi.getConfig()
        return await this._fetch(config['host'] + "/urls/add",null,config['device_token']??null,{
            "r":[{
                "t": title,
                "u": url,
                "v": lastVisitTime,
                "s": status,
            }]},null)
    }    
    async addHistorys(records){
        let config = await this.chromeApi.getConfig()
        return await this._fetch(config['host'] + "/urls/add",null,config['device_token']??null,{
            "r":records,
        },null)
    }
}