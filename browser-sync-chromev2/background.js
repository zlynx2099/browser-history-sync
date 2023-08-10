var config = null;
var lastUpdateTime = 0;
var inited = false;
var DB = new IndexDBOperation("urldb", 1, [{
  // {url,tabId,lastVisitTime,title,status}
  objectStoreName: "urls",
  type: 1,
  keyMode: { keyPath: 'url' },
  indexs:    [{ indexName: "urlIndex", fieldName: "url", only: { unique: false } },
      { indexName: "tabIdIndex", fieldName: "tabId", only: { unique: false } },//索引
      //{ indexName: "doc_typeIndex", fieldName: "doc_type", only: { unique: false } },
  ]
},{
  // {host,iconUrl}
  objectStoreName: "favicons",
  type: 1,
  keyMode: { keyPath: 'host' },
  indexs:    [{ indexName: "hostIndex", fieldName: "host", only: { unique: false } },]
},])
Init();
async function Init(){
  config = await storageUtil.get("config")
  if (null == config){
    config = {}
  }
  inited = true;
  func.startWatching()
}

func = {
  getConfig: async ()=>{
    return JSON.stringify(config);
  },
  configSet: async (key,value)=>{
    config[key] = value
    await storageUtil.set("config",config)
  },
  login: async (host,username,password) => {
    let j = await _fetch(host + "/auth/login",null,null,{
      "username":username,
      "password":password
    },"登录失败,请检查参数");
    if (j.code == 0){
      config['host'] = host;
      config['username'] = username;
      await storageUtil.set("config",config)
    }
    return j;
  },
  logout: async (auth_token)=>{
    if (auth_token){
      await _fetch(host + "/auth/logout",auth_token,null,{},"注销失败,请检查参数");
    }
    config = {}
    await storageUtil.set("config",{})
    func.startWatching()
  },
  removeAccount: async (auth_token) => {
    if (!auth_token){
      return {"code":-999,"msg":"未登录"}
    }
    return await _fetch(config['host'] + "/auth/remove",auth_token,null,{},"销户失败,请检查参数")
  },
  deviceList: async (auth_token) => {
    if (!auth_token){
      return {"code":-999,"msg":"未登录"}
    }
    return await _fetch(config['host'] + "/device/list",auth_token,null,{},"获取失败,请检查参数")
  },
  addDevice: async (auth_token,device) => {
    if (!auth_token){
      return {"code":-999,"msg":"未登录"}
    }
    let j = await _fetch(config['host'] + "/device/add",auth_token,null,{
      "device":device
    },"获取失败,请检查参数")
    return j;
  },
  searchRemoteHistory: async (text,ts,device_name) => {
    let j = await _fetch(config['host'] + "/urls/list",null,config['token'],{
      "text":text,
      "ts":ts,
      "device_name":device_name,
    },"查询失败,请检查参数")
    return j
  },
  importAllHistory: async () => {
    let device_token = config['token'];
    if (!device_token){
      return {"code":-999,"msg":"未登录"}
    }
    let data = await chromeApi.searchAllHistroy();
    let records = [];
    for (var d of data){
      records.push({
        "t": d.title,
        "u": d.url,
        "v": parseInt(1000 * d.lastVisitTime),
        "s": 1,
      })
    }
    let j = await _fetch(config['host'] + "/urls/add",null,config['token'],records,"导入失败,请检查参数")
    return j 
  },
  addHistory: async (o) => {
    let device_token = config['token'];
    if (!device_token){
      return
    }
    if (o.url == ""){
      debugger
    }
    await _fetch(config['host'] + "/urls/add",null,config['token'],[o],"导入失败,请检查参数")
  },
  onUpdated: function(tabId, changeInfo, tab){
    (async ()=>{
      if (tab.url == "chrome://newtab/"){
        return
      }
      if (changeInfo.status && changeInfo.status == "complete"){
        let item = await DB.queryBykeypath(["urls"],tab.url)
        if (!tab){
          console.log(tabId,changeInfo,tab)
        }
        if (tab.title){
          item.title = tab.title
        }
        item.status = 1
        await DB.updateData(["urls"], [item])
        await func.addHistory({"u":item['url'],"v":item['lastVisitTime'],"t":item['title']})
        await DB.deleteData(["urls"], [item.url])
      }
    })()
  },
  onVisited: function(tab) {
    (async ()=>{
      await DB.updateData(["urls"], [{
        "url":tab.url,
        "title":tab.title,
        "lastVisitTime":parseInt(tab.lastVisitTime*1000),
        "status":0,
      }])
      await new Promise(r => setTimeout(r, 15000));
      let item = await DB.queryBykeypath(["urls"],tab.url)
      if (item && item.status == 0 && item.lastVisitTime == tab.lastVisitTime){
        await func.addHistory({"u":item['url'],"v":item['lastVisitTime'],"t":item['title']})
        await DB.deleteData(["urls"], [item.url])
      }
    })()
  },
  startWatching: () => {
    if (config && config['host'] && config['token']){
      chrome.tabs.onUpdated.addListener(func.onUpdated)
      chrome.history.onVisited.addListener(func.onVisited)
    }else{
      chrome.tabs.onUpdated.removeListener(func.onUpdated)
      chrome.history.onVisited.removeListener(func.onVisited)
    }
  }
}
chromeApi = {
  _apiHistorySearch: (text,startTime,endTime,maxResults) => {
    return new Promise((res,rej)=>{
      chrome.history.search({text:text,startTime:startTime,maxResults:maxResults},(data)=>{
        res(data);
      })
    })
  },
  searchAllHistroy: async () => {
    return await chromeApi._apiHistorySearch("",0,null,0);
  },
  searchRecentHistory: async (text,last_ts) => {
    let recent = await chromeApi._apiHistorySearch(text,null,null);
    if (recent.length > 100){
      recent.sort((a,b) => b.lastVisitTime - a.lastVisitTime);
      return recent;
    }else {
      recent = await chromeApi._apiHistorySearch(text,0,0);
      return recent.length>=100?recent.slice(0,100):recent;
    }
  }
}
async function _fetch(url,auth_token,device_token,data,defaultMsg) {
  headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  }
  if (device_token){
    headers['X-CSRF-Token'] = device_token
  }
  if (auth_token) {
    headers['Authorization'] = auth_token
  }
  try {
    let res = await fetch(url,{
      mode: "cors",
      method: "POST",
      headers: headers,
      body: JSON.stringify(data)
    })
    return await res.json()
  }catch (e){ 
    return {"code":-1,"msg":defaultMsg}
  }
}
//{url,tabId,lastVisitTime,title,status}
//
//关闭tab或者加载完成时,上传数据
//后退更新lastchanged
