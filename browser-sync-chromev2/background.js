
var lastUpdateTime = 0;
var inited = false;
var chromeApi = new ChromeApi()
var pagefunc = new PageUtil(chromeApi)
chrome.browserAction.setBadgeText({text: "off"})
var DB = new IndexDBOperation("urldb", 1, [{
    // {url,tabId,lastVisitTime,title,status}
    objectStoreName: "urls",
    type: 1,
    keyMode: { keyPath: 'url' },
    indexs:    [
      { indexName: "urlIndex", fieldName: "url", only: { unique: false } },
      { indexName: "statusIndex", fieldName: "status", only: { unique: false } },
      { indexName: "visitIndex", fieldName: "lastVisitTime", only: { unique: false } },
    ]
  },{
    // {host,iconUrl}
    objectStoreName: "favicons",
    type: 1,
    keyMode: { keyPath: 'host' },
    indexs:    [{ indexName: "hostIndex", fieldName: "host", only: { unique: false } },]
  },]
)

Init();
async function Init(){
  config = await chromeApi.getConfig()
   if (config['auth_expired'] && config['auth_expired'] < new Date().getTime()){
    delete config['auth']
    delete config['auth_expired']
    await chromeApi.saveConfig(config)
  }
  inited = true;
  func.startWatching()
}

func = {
  onUpdated: function(tabId, changeInfo, tab){
    (async ()=>{
      if (tab.url.startsWith("chrome://")){
        return
      }
      if (changeInfo.status && changeInfo.status == "complete"){
        let visit = await chromeApi.getLastVisit(tab.url)
        if (visit){
          item = {
            "url":tab.url,
            "title":tab.title,
            "lastVisitTime":parseInt(visit.visitTime),
            "status":1,
          }
          await pagefunc.addHistory(item['url'],item['title'],item['lastVisitTime'],item["status"])
        }
      }
    })()
  },
  onVisited: function(tab) {
    (async ()=>{
      if (tab.url.startsWith("chrome://")){
        return
      }
      await DB.updateData(["urls"], [{
        "url":tab.url,
        "title":tab.title,
        "lastVisitTime":tab.lastVisitTime?parseInt(tab.lastVisitTime/1000):new Date().getTime()*1000,
        "status":0,
      }])
      await new Promise(r => setTimeout(r, 15000));
      let item = await DB.queryBykeypath(["urls"],tab.url)
      if (item && item.status == 0 && item.lastVisitTime == parseInt(tab.lastVisitTime/1000)){
        let j = await pagefunc.addHistory(item['url'],item['title'],item['lastVisitTime'])
        if (j.code == 0){
          await DB.deleteData(["urls"], [item.url])
        }
      }
    })()
  },
  startWatching: () => {
    if (config && config['host'] && config['device_token']){
      chrome.tabs.onUpdated.addListener(func.onUpdated)
      //chrome.history.onVisited.addListener(func.onVisited)
      chromeApi.badgeOn()
      //func.uploadAllHistory()
    }else{
      chrome.tabs.onUpdated.removeListener(func.onUpdated)
      //chrome.history.onVisited.removeListener(func.onVisited)
    }
  },
  uploadAllHistory: async() => {
    let t = new Date().getTime()
    while (true){
      let data = await DB.queryByIndex(["urls"],{"name":"statusIndex","value":0},{"key":"lastVisitTime","value":t*1000,"opt":"<"})
      if (data.length == 0){
        break
      }
      let records = [];
      for (var d of data){
        records.push({
          "t": d.title,
          "u": d.url,
          "v": parseInt(d.lastVisitTime/1000)
        })
      }
      let j = await pagefunc.addHistorys(records)
      if (j.code == 0){
        let delItems = [];
        for (var d of data){
          delItems.push(d.url)
        }
        await DB.deleteData(["urls"],delItems)
      }else{
        break
      }
    }
  }
}
//{url,tabId,lastVisitTime,title,status}
//
//关闭tab或者加载完成时,上传数据
//后退更新lastchanged
//todo 302,未complete status = 2
//