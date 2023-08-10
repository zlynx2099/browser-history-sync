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
let bgfunc =  chrome.extension.getBackgroundPage().func;
var func = {
  getLoginToken: ()=>{
    let cookies = document.cookie.split(";")
    for (var cookie of cookies){
      if (cookie.length > 0 && cookie.split("=").length > 1 && cookie.split("=")[0] == "token"){
        return cookie.split("=")[1]
      }
    }
    return '';
  },
  init: async () => {
    $('body>div').removeClass('show');
    $('body>div').hide();
    let config = await bgfunc.getConfig()
    config = JSON.parse(config)
    let device_token = null;
    if (config){
      if (config['host']){
        $('#setting-init-page input[name=host]').val(config['host']);
        $('#setting-main-page span[name=host]').text(config['host']);
      }else if (func.getLoginToken().length > 0){
        document.cookie = "token="
      }
      if (config['username']){
        $('#setting-init-page input[name=username]').val(config['username']);
      }
      if (config['token']){
        device_token = config['token']
      }
      if (config['device']){
        $('#setting-main-page span[name=device]').text(config['device']);
      }
    }
    if (device_token){
      //设备已登录
      $('#container').show()
      $('#nav-tab').show()
      $("#setting-main-page").show();
    }else if (func.getLoginToken().length > 0){
      // 已登录展示设置页面
      await func.initSettingInitDevicePage();
      $("#setting-init-device-page").show();
      $("#setting-init-device-page").addClass("show");
    }else{
      // 未登录展示登录页面
      $("#setting-init-page").show();
      $("#setting-init-page").addClass("show");
    }
    $('body').addClass('show');
  },
  initHistoryPage : async () => {
    let div = $("#history-main-page .device-list");
    div.html('')
    let res = await bgfunc.deviceList(func.getLoginToken());
    if (res.code == -999){
      await func.unauthorizeHint()
      return
    }
    if (res.code == 0){
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
    }else{
      await func.hint(res.msg)
    }
  },
  showHistoryMainPage: async () => {
    $("#history-list-page").removeClass('show')
    $("#history-list-page").hide()
    $("#history-main-page").show()
    $("#history-main-page").addClass('show')
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
  showLocalDeviceHistory: async () => {
    $("#history-item-list").html('')
    $("#history-item-list").attr("ts","")
    $("#history-list-page").attr("device","local")
    $("#history-list-page .history-device-name").text("当前设备浏览历史:")
    await func.showDeviceHistory()
  },
  showAllDeviceHistory: async () => {
    $("#history-item-list").html('')
    $("#history-item-list").attr("ts","")
    $("#history-list-page").attr("device","remote")
    $("#history-list-page .history-device-name").text("所有设备浏览历史:")
    await func.showDeviceHistory()
  },
  showDeviceHistory: async (...params)=>{
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
      if ($("#history-item-list .list-group-item:last").offset().top < $("#history-list-page .overflow-y-auto").offset().top + $("#history-list-page .overflow-y-auto").height()){
        $(this).attr('scrolling','true')
        func.loadDeviceHistory(device,device_name)
      }
    })
    await func.loadDeviceHistory(device,device_name)
    $("#history-main-page").removeClass('show')
    $("#history-main-page").hide()
    $("#history-list-page").show()
    $("#history-list-page").addClass('show')
    if ($("#history-item-list").height() < $("#history-list-page .overflow-y-auto").height()){
      await func.loadDeviceHistory(device,device_name)
    }
  },
  loadDeviceHistory: async (device,device_name) =>{
    $("#history-item-list .last-item").remove()
    let $container = $("#history-item-list")
    let ts = $container.attr('ts')?parseInt($container.attr('ts')):null;
    let text = $container.attr('text')??null;
    let config = await bgfunc.getConfig();
    let data = [];
    if (device == "local"){
      return
      data = await bgfunc.searchRecentHistory();
    }else{
      data = await bgfunc.searchRemoteHistory(text,ts,device_name)
    }
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
  initSettingInitDevicePage: async ()=>{
    let res = await bgfunc.deviceList(func.getLoginToken());
    if (res.code == -999){
      await func.unauthorizeHint()
      return
    }
    if (res.code == 0){
      let div = $("#setting-device-list");
      for (var device of res.data){
        let item = $(`<div class="list-group-item list-group-item-action btn-func text-center"></div>`);
        item.text(device.device_name)
        item.attr('func',`chooseDevice`)
        item.attr('param1',device.device_name)
        item.attr('param2',device.token)
        let dom = $(`<div class="list-group mb-2"></div>`);
        item.appendTo(dom);
        dom.appendTo(div);
      }
    }
  },
  importAllHistory: async () => {
    let res = await bgfunc.importAllHistory();
    if (res.code == 0){
      $('#btnImportAll').removeClass("btn-primary")
      $('#btnImportAll').addClass("btn-success")
      $('#btnImportAll').text("已导入")
      $('#btnImportAll').removeClass("btn-func")
    }else{
      await func.hint(res.msg)
    }
  },
  login: async ()=>{
    let div = $('#setting-init-page');
    div.find('span[name=hint]').removeClass('show');
    div.find('span[name=hint]').text('');
    let host = div.find('input[name=host]').val();
    let username = div.find('input[name=username]').val();
    let password = div.find('input[name=password]').val();
    if (host == '' || username == '' || password == ''){
      div.find('span[name=hint]').text('缺少必要字段');
      div.find('span[name=hint]').addClass('show');
      return
    }
    let res = await bgfunc.login(host,username,password);
    if (res.code != 0){
      div.find('span[name=hint]').text(res.msg);
      div.find('span[name=hint]').addClass('show');
      return
    }
    var now = new Date();
    var time = now.getTime();
    var expireTime = time + 1000*3600*24;
    now.setTime(expireTime);
    document.cookie = `token=${res.data.token};expires=${now.toUTCString()};path=/`;
    await bgfunc.configSet('host',host);
    await bgfunc.configSet('username',username);
    $('#setting-init-page').removeClass('show');
    $('#setting-init-page').hide();
    await func.initSettingInitDevicePage()
    $('#setting-init-device-page').show();
    $('#setting-init-device-page').addClass('show');
  },
  logout: async () =>{
    document.cookie = "token="
    await bgfunc.logout(func.getLoginToken());
    await func.init()
  },
  removeAccount: async () => {
    await bgfunc.removeAccount(func.getLoginToken())
    await func.logout()
  },
  addDevice: async ()=>{
    let div = $('#setting-init-device-page');
    div.find('span[name=hint]').text('');
    div.find('span[name=hint]').removeClass('show');
    let device = div.find('input[name=device]').val();
    if (device.length == 0){
      div.find('span[name=hint]').text('设备名不能为空');
      div.find('span[name=hint]').addClass('show');
      return
    }
    let res = await bgfunc.addDevice(func.getLoginToken(),device);
    if (res.code == -999){
      await func.unauthorizeHint()
      return
    }else if (res.code != 0){
      await func.hint(res.msg)
      return
    }else{
      await func.chooseDevice(device,res.data.device_token);
    }
  },
  chooseDevice: async (device,token)=>{
    await bgfunc.configSet('device',device);
    await bgfunc.configSet('token',token);
    bgfunc.startWatching()
    await func.init()
  },
  openTab: async (url) => {
    window.open(url);
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
  unauthorizeHint: async ()=>{
    await func.hint("未登录,即将跳转登录页");
    setTimeout(async ()=>{
      await func.logout()
    },2100)
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