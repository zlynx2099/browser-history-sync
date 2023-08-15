/* data is in flat array format like this:
[
  {
    id: 'abc',
    name: 'ABCDE',
    parent: null
  },
  {
    id: 'def',
    name: 'DEFGH',
    parent: 'abc'
  }
]
*/
var chromeApi = new ChromeApi()
var pagefunc = new PageUtil(chromeApi)
var bg = chrome.extension.getBackgroundPage()
var utils = {
  getFormatTime: (timestamp)=>{
    var date = new Date(timestamp);
    var Y = date.getFullYear() + '-';
    var M = (date.getMonth()+1 < 10 ? '0'+(date.getMonth()+1):date.getMonth()+1) + '-';
    var D = (date.getDate()< 10 ? '0'+date.getDate():date.getDate())+ ' ';
    var h = (date.getHours() < 10 ? '0'+date.getHours():date.getHours())+ ':';
    var m = (date.getMinutes() < 10 ? '0'+date.getMinutes():date.getMinutes()) + ':';
    var s = date.getSeconds() < 10 ? '0'+date.getSeconds():date.getSeconds();
    return Y+M+D+h+m+s;
 },
}
var func = {
  _page_to: (id,index) => {
    $(id+".pager>div").hide()
    $(id+`.pager>div`).removeClass("show")
    $(id+`.pager>div[tabIndex=${index}]`).css("display","flex")
    $(id+`.pager>div[tabIndex=${index}]`).addClass("show")
  },
  _page_init: (id) => {
    $(id+".pager>div").hide()
  },
  _loading: () => {
    $("#loading").css("display","flex")
    $("#loading").addClass("show")
  },
  _stop_loading: () => {
    $("#loading").removeClass("show")
    $("#loading").css("display","none")
  },
  init: async () => {
    func._loading()
    func._page_init()
    let config = await chromeApi.getConfig()
    if (config){
      if (config['host']){
        $('#form-login input[name=host]').val(config['host']);
        $('#form-login span[name=host]').text(config['host']);
      }
      if (config['username']){
        $('#form-login input[name=username]').val(config['username']);
      }
      if (config['device']){
        $('#form-login span[name=device]').text(config['device']);
      }
      if (config['expireMode']){
        $('#form-login option').removeAttr("selected")
        $(`#form-login option[value=${config['expireMode']}]`).attr("selected",true)
        $('#form-authorize option').removeAttr("selected")
        $(`#form-authorize option[value=${config['expireMode']}]`).attr("selected",true)
      }
    }
    if (config['device_token']){
      if (config['auth']){
        await func.initMainPage();
        func._page_to("#top-page",3)
        chromeApi.badgeOn()
      }else{
        func._page_to("#top-page",4)
        chromeApi.badgeOff()
      }
    }else if (config['auth']){
      await func.initDevicePage();
      func._page_to("#top-page",2)
    }else{
      // 未登录展示登录页面
      func._page_to("#top-page",1)
    }
    func._stop_loading()
  },
  checkServer: async () =>{
    let j = await pagefunc.check()
    if (j.code != 0){
      await func.unConnectedHint()
      return false
    }
    return true
  },
  initMainPage : async () => {
    let res = await pagefunc.deviceList();
    if (res.code == -9999){
      await func.unConnectedHint()
      return
    }else if (res.code == -999){
      await func.unauthorizeHint()
      return
    }
    let div = $("#history-main-page .device-list");
    div.html('')
    for (var device of res.data){
      let item = $(`
      <div class="list-group mb-2">
        <div href="#" class="list-group-item list-group-item-action icon-item btn-func" func="showDeviceHistory">
          <span></span>
          <i class="bi bi-arrow-right-short"></i>
        </div>
      </div>
      `)
      item.find("span").text(device.device_name+"浏览历史")
      item.find(".list-group-item").attr('param1',device.device_name)
      item.appendTo(div);
    }
    $("#history-main-page").addClass("show")
  },
  initDevicePage: async ()=>{
    let res = await pagefunc.deviceList();
    if (res.code == -9999){
      await func.unConnectedHint()
      return
    }else if (res.code == -999){
      await func.unauthorizeHint()
      return
    }
    if (res.code == 0){
      let div = $("#form-device .device-list");
      div.html('')
      for (var device of res.data){
        let dom = $(`<div class="list-group mb-2"><div class="list-group-item list-group-item-action btn-func text-center"></div></div>`)
        let item = dom.find(".list-group-item");
        item.text(device.device_name)
        item.attr('func',`chooseDevice`)
        item.attr('param1',device.device_name)
        item.attr('param2',device.token)
        dom.appendTo(div);
      }
    }
  },
  initSettingPage: async () => {
    let config = await chromeApi.getConfig()
    if (config['host']){
      $("#form-setting span[name=host]").text(config['host'])
    }
    if (config['device']){
      $("#form-setting span[name=device]").text(config['device'])
    }
  },
  showHistoryMainPage: async () => {
    $("#history-list-page").removeClass('show')
    $("#history-list-page").hide()
    $("#history-main-page").css("display","flex")
    $("#history-main-page").addClass('show')
    $("#history-item-list").html('')
    $("#history-list-page input[name=text]").val('')
    $("#history-item-list").removeAttr("text")
    $("#history-item-list").removeAttr("ts")
    $("#history-list-page").removeAttr('device_name')
  },
  searchHistory: async () => {
    let text = $("#history-list-page input[name=text]").val();
    let device = $("#history-list-page").attr("device")??null;//local,remote,all
    let device_name = $("#history-list-page").attr("device_name")??null;
    $("#history-item-list").html('')
    $("#history-item-list").attr("text",text)
    $("#history-item-list").attr("ts","")
    await func.loadDeviceHistory(device,device_name)
    if ($("#history-item-list").height() < $("#history-list-page .overflow-y-auto").height()){
      await func.loadDeviceHistory(device,device_name)
    }
  },
  showAllDeviceHistory: async () => {
    $("#history-item-list").html('')
    $("#history-item-list").attr("ts","")
    $("#history-list-page").attr("device","remote")
    $("#history-list-page .history-device-name").text("所有设备浏览历史:")
    await func.showDeviceHistory()
  },
  showDeviceHistory: async (...params)=>{
    func._loading()
    $("#history-item-list").html('')
    $("#history-item-list").attr("ts","")
    let device = null;//local,remote,all
    let device_name = null;
    if ($("#history-list-page").attr("device")){
      device = $("#history-list-page").attr("device")
    }
    if (params.length > 0){
      $("#history-list-page").attr("device_name",params[0])
      device_name = params[0]
      $("#history-list-page .history-device-name").text("设备" +device_name+"浏览历史:")
    }
    $("#history-list-page .overflow-y-auto").on('scroll',function(){
      if ($(this).attr('scrolling')){
        return
      }
      if ($("#history-item-list .list-group-item").length == 0){
        return
      }
      if ($("#history-item-list .list-group-item:last").offset().top < $("#history-list-page .overflow-y-auto").offset().top + $("#history-list-page .overflow-y-auto").height()){
        $(this).attr('scrolling','true')
        func.loadDeviceHistory(device,device_name)
      }
    })
    await func.loadDeviceHistory(device,device_name)
    func._page_to("#nav-history",2)
    if ($("#history-item-list").height() < $("#history-list-page .overflow-y-auto").height()){
      await func.loadDeviceHistory(device,device_name)
    }
    func._stop_loading()
  },
  loadDeviceHistory: async (device,device_name) =>{
    $("#history-item-list .last-item").remove()
    let $container = $("#history-item-list")
    let ts = $container.attr('ts')?parseInt($container.attr('ts')):null;
    let text = $container.attr('text')??null;
    let data = await pagefunc.searchHistory(text,ts,device_name)
    if (data.code != 0){
      return
    }
    for (var data_item of data.data){
      let item = $(`<div class="list-group-item list-group-item-action one-line btn-func"></div>`);
      let img = $(`<img class="favicon"/>`)
      img.attr("src",`${new URL(data_item.u).origin}/favicon.ico`)
      let span = $(`<span></span>`)
      span.text(data_item.t)
      item.attr('func',`openTab`)
      item.attr('param1',data_item.u)
      img.appendTo(item)
      span.appendTo(item)
      item.appendTo($container)
    }
    if (data.data.length > 0){
      $container.append($(`<div class="list-group-item one-line text-center last-item"><div class="rotate"><i class="bi bi-arrow-repeat"></i></div></div>`))
      $container.attr('ts',data.data[data.data.length-1].v)
    }
    $("#history-list-page .overflow-y-auto").attr('scrolling','')
  },
  importAllHistory: async () => {
    func._loading()
    let res = await pagefunc.importAllHistory();
    if (res.code == 0){
      $('#btnImportAll').removeClass("btn-primary")
      $('#btnImportAll').addClass("btn-success")
      $('#btnImportAll').text("已导入")
      $('#btnImportAll').removeClass("btn-func")
    }else{
      func.hint(res.msg)
    }
    func._stop_loading()
  },
  login: async ()=>{
    let div = $('#form-login');
    let host = div.find('input[name=host]').val();
    let username = div.find('input[name=username]').val();
    let password = div.find('input[name=password]').val();
    let expireMode = div.find('select[name=expireMode]').val()??"1";
    if (host == '' || username == '' || password == ''){
      await func.hint('缺少必要字段');
      return
    }
    func._loading()
    let res = await pagefunc.login(host,username,password,expireMode);
    func._stop_loading()
    if (res.code != 0){
      await func.hint(res.msg);
      return
    }
    bg.func.startWatching()
    div.find('input[name=password]').val('');
    await func.initDevicePage()
    await func._page_to("#top-page",2)
  },
  authorize: async ()=>{
    let div = $('#form-authorize');
    let password = div.find('input[name=password]').val();
    let expireMode = div.find('select[name=expireMode]').val()??"1";
    if (password == ''){
      await func.hint('缺少必要字段');
      return
    }
    func._loading()
    let res = await pagefunc.authorize(password,expireMode);
    func._stop_loading()
    if (res.code != 0){
      await func.hint(res.msg);
      return
    }
    div.find('input[name=password]').val('');
    await func.init()
  },
  logout: async () =>{
    await pagefunc.logout()
    await func.init()
  },
  addDevice: async ()=>{
    let div = $('#form-device');
    let device = div.find('input[name=device]').val();
    if (device.length == 0){
      await func.hint('设备名不能为空');
      return
    }
    let res = await pagefunc.addDevice(device);
    if (res.code == -9999){
      await func.unConnectedHint()
      return
    }else if (res.code == -999){
      await func.unauthorizeHint()
      return
    }else if (res.code != 0){
      await func.hint(res.msg)
      return
    }
    await func.chooseDevice(device,res.data.device_token);
  },
  chooseDevice: async (device,token)=>{
    func._loading()
    await pagefunc.chooseDevice(device,token)
    await func.init()
  },
  openTab: (url) => {
    window.open(url,"_blank")
  },
  hint: async (text) => {
    $("#hint .toast-body").text(text)
    $("#hint").show()
    $("#hint").addClass("show")
    setTimeout(()=>{
      $("#hint").removeClass("show")
      setTimeout(()=>{
        $("#hint").hide()
        $("#hint .toast-body").text('')
      },600)
    },1500)
  },
  unConnectedHint: async ()=>{
    await func.hint("未连接到服务器,即将跳转登录页");
    setTimeout(async ()=>{
      await pagefunc.logout();
      await func.init()
    },2100)
  },
  unauthorizeHint: async ()=>{
    let config = await chromeApi.getConfig()
    if (config['device_token']){
      await func.hint("设备失效,即将跳转验证页");
      delete config['auth']
      delete config['auth_expired']
      await chromeApi.saveConfig(config)
      setTimeout(async ()=>{
        await func.init()
      },2100)
    }else{
      await func.hint("未登录,即将跳转登录页");
      setTimeout(async ()=>{
        await pagefunc.logout();
        await func.init()
      },2100)
    }
  },
}
$(document).on('click','.btn-func',function(e){
  let target = $(e.currentTarget);
  let f = target.attr('func');
  let params = [];
  let i = 1;
  while (true){
    if (target.attr("param"+i)){
      params.push(target.attr("param"+i));
      i++;
    }else{
      break;
    }
  }
  if (f && func[f]){
    func[f](...params);
  }
})
$(document).on('click','.btn-page',function(e){
  let target = $(e.currentTarget);
  $(target.attr('target-hide')).removeClass("show");
  $(target.attr('target-hide')).hide();
  $(target.attr('target-show')).show();
  $(target.attr('target-show')).addClass("show");
  let initFunc = $(target.attr('target-show')).attr('func-init');
  if (initFunc && func[initFunc]){
    func[initFunc]();
  }
})
$(document).on('click','.history-item',function(e){
  let target = $(e.currentTarget);
  let url = target.attr('data-url');
  chrome.tabs.create({
    url: url
  });
})

document.addEventListener("error", function(e){
  var elem = e.target;
  if(elem.tagName.toLowerCase() === 'img' && elem.className=="favicon"){
    elem.outerHTML = `<i class="bi bi-globe favicon"></i>`
  }
}, true);
func.init();