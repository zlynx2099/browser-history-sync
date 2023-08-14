class ChromeApi{
    async getConfig(){
        let config = await new Promise (r => chrome.storage.local.get("config",r))
        return config.config??{}
    }
    async saveConfig(cfg){
        await chrome.storage.local.set({"config":cfg})
    }
    async _apiHistorySearch(text,startTime,endTime,maxResults){
      return new Promise((res,rej)=>{
        chrome.history.search({text:text,startTime:startTime,endTime:endTime,maxResults:maxResults},(data)=>{
          res(data);
        })
      })
    }
    async searchAllHistroy() {
      return await chromeApi._apiHistorySearch("",0,null,0);
    }
    badgeOn(){
        chrome.browserAction.setBadgeText({text: "on"})
        chrome.browserAction.setBadgeBackgroundColor({ color: "#2ecc71" });
    }
    badgeOff(){
        chrome.browserAction.setBadgeText({text: "off"})
        chrome.browserAction.setBadgeBackgroundColor({ color: [0,0,0,0]});
    }
}