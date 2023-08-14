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
    console.log("loading " + new Date().getTime() )
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
      let div = $("#form-device");
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
/*
var selected = 0;
var data = [];

//Event listener for button to open settings page
let btt = document.querySelector("#settings-icon");
btt.addEventListener("click", () => {
    chrome.runtime.sendMessage("showOptions");
});


function currently_selected_elem(){
  return document.querySelector('li.selected');
}

function orphans() {
  return data.filter(function(item) {
    return item.parentId === null;
  });
}

function getItemsByText(query) {
  var queryx = query.split(' ');
  return data.filter(function(item) {
    const src = item.title.toString().toLowerCase();
    for (var i = 0; i < queryx.length; i++) {
      if (!src.includes(queryx[i].toString().toLowerCase())) {
        return false;        
      }
    }
    return true;
  });
}

function hasChildren(parentId) {
  return data.some(function(item) {
    return item.parentId === parentId;
  });
}

function getChildren(parentId) {
  return data.filter(function(item) {
    return item.parentId === parentId;
  });
}
const folderIcon = '<svg class="fld-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>';
function generateListItem(query, item) {
  const li = document.createElement('li');
  li.id = 'item-' + item.id;
  li.tabIndex = 0;
  const a = document.createElement('a');
  if (hasChildren(item.id)) {//Check if it's a bookmark ( Check One)
    
    a.href = '#';
    a.tabIndex = -1;
    
    a.classList.add('fld-label');
    a.addEventListener('click', expand);
    li.appendChild(a);
  }
  const span = document.createElement('span');
  itemlabeltext = document.createTextNode(item.title);
  sanitizedtext = itemlabeltext.nodeValue;
  if (query && query.length > 0) {
    var queryx = query.split(' ');
    for (var i = 0; i < queryx.length; i++)
      queryx[i] = queryx[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var reg = new RegExp(queryx.join('|'), 'gi');
    sanitizedtext = sanitizedtext.replace(reg, '<b>$&</b>');
  }
  itemlabel = document.createElement('span');
  if (item.device && item.device != localStorage.deviceId && document.getElementById('searchField').value)
    sanitizedtext += ' <span class="source">' + item.device + '</span>';
  itemlabel.innerHTML = ' ' + sanitizedtext;
  if (item.url) {//Check if it's a bookmark (Check Two)
    const itemlink = document.createElement('a');
    itemlink.href = item.url;
    itemlink.target = '_blank';
    itemlink.appendChild(itemlabel);
    span.appendChild(itemlink);
    li.appendChild(span);
  } else {
    a.innerHTML = folderIcon+sanitizedtext;
  }
  
  return li;
}

function expand(event) {
  console.time('expand');
  event.preventDefault();
  event.stopPropagation();
  const et = event.target,
        parent = et.parentElement,
        id = parent.id.replace('item-', ''),
        kids = getChildren(id),
        items = kids.map(generateListItem.bind(null, '')),
        ul = document.createElement('ul');
  var hasSelected = false;
  items.some(function(li) {
    if (!hasSelected) {
      if (currently_selected_elem()) {
        var curNode = currently_selected_elem();
        curNode.classList.remove('selected');
      }
      li.classList.add('selected');
      hasSelected = true;
    }
    ul.appendChild(li);
  });
  parent.appendChild(ul);
  et.classList.remove('plus');
  et.classList.add('minus');
  et.removeEventListener('click', expand);
  et.addEventListener('click', collapse);
  console.timeEnd('expand');
}

function collapse(event) {
  console.time('collapse');
  event.preventDefault();
  event.stopPropagation();
  const et = event.target,
        parent = et.parentElement,
        ul = parent.querySelector('ul');        
  parent.removeChild(ul);
  et.classList.remove('minus');
  et.classList.add('plus');
  et.removeEventListener('click', collapse);
  et.addEventListener('click', expand);
  if (currently_selected_elem()) {
    var curNode = currently_selected_elem();
    curNode.classList.remove('selected');
  }
  et.parentNode.classList.add('selected');
  console.timeEnd('collapse');
}

function addRemotebookmarks() {
  const root = document.getElementById('root'),
        orphansArray = orphans();
  console.log(orphansArray);
  root.innerHTML = '';
  if (orphansArray.length) {
    const items = orphansArray.map(generateListItem.bind(null, '')),
          ul = document.createElement('ul');
    ul.id = 'rootList';
    items.some(function(li) {
      ul.appendChild(li);
    });
    root.appendChild(ul);
  }
}

function searchItem(query) {
  if (!query) {
    addRemotebookmarks();
    return;
  }
  const root = document.getElementById('root');
  resultsArray = getItemsByText(query);
  root.innerHTML = '';
  if (resultsArray.length) {
    const items = resultsArray.map(generateListItem.bind(null, query)),
          ul = document.createElement('ul');
    ul.id = 'rootList';
    var hasSelected = false;
    var nresults = 0;
    // We use some as an alternative to forEach and use return as an early-break
    items.some(function(li) {
      if (!hasSelected) {
        if (currently_selected_elem()) {
          var curNode = currently_selected_elem();
          curNode.classList.remove('selected');
        }
        li.classList.add('selected');
        hasSelected = true;
      }
      ul.appendChild(li);
      if (nresults++ > 100)
        return true;
    });
    root.appendChild(ul);
  }
}

function process_key(e)
{
  var list = document.getElementById('rootList');
  if (!list)
    return false;
  var first = list.firstChild;
  if (!first)
    return false;
  var maininput = document.getElementById('searchField');
  console.log('Pressed: ' + e.keyCode);
  if (e.keyCode == 38) { // up
     e.preventDefault();
     if (currently_selected_elem()) {
       var curNode = currently_selected_elem();
       if (currently_selected_elem().previousSibling)
         currently_selected_elem().previousSibling.classList.add('selected');
       else if (currently_selected_elem() && currently_selected_elem().parentNode.tagName == 'UL' && currently_selected_elem().parentNode.parentNode.tagName == 'LI')
         currently_selected_elem().parentNode.parentNode.classList.add('selected');
       else
         maininput.focus();
       curNode.classList.remove('selected');
     }
     return true;
  }
  else if (e.keyCode == 40) { // down
     e.preventDefault();
     if (currently_selected_elem()) {
       var curNode = currently_selected_elem();
       if (currently_selected_elem().nextSibling)
         currently_selected_elem().nextSibling.classList.add('selected');
       curNode.classList.remove('selected');
     } else {
       first.classList.add('selected');
     }
     return true;
  }
  else if (e.keyCode == 13) { // enter
     e.preventDefault();
     if (currently_selected_elem()) {
       document.querySelector('li.selected a').click();
     }
     return true;
  }
  else if (e.keyCode == 39) { // right
     e.preventDefault();
     if (currently_selected_elem() && document.querySelector('li.selected a') && document.querySelector('li.selected a').classList.contains('plus')) {
       document.querySelector('li.selected a').click();
     } else if (currently_selected_elem() && document.querySelector('li.selected a') && document.querySelector('li.selected a').classList.contains('minus')) {
       var curNode = currently_selected_elem();
       document.querySelector('li.selected ul>li').classList.add('selected');
       curNode.classList.remove('selected');
     }
     return true;
  }
  else if (e.keyCode == 37) { // left
     e.preventDefault();
     if (currently_selected_elem() && document.querySelector('li.selected a') && document.querySelector('li.selected a').classList.contains('minus')) {
       document.querySelector('li.selected a').click();
     }
     else if (currently_selected_elem() && currently_selected_elem().parentNode.tagName == 'UL' && currently_selected_elem().parentNode.parentNode.tagName == 'LI'
           && currently_selected_elem().parentNode.parentNode.firstChild.classList.contains('minus')) {
       currently_selected_elem().parentNode.parentNode.firstChild.click();
     }
     return true;
  }
  return false;
}

console.log('Loading popup');

if (typeof localStorage.remoteBookmarks != 'undefined')
  data = JSON.parse(localStorage.remoteBookmarks);
addRemotebookmarks();

document.getElementById('root').addEventListener('keydown', function (e) {
  process_key(e);
});

document.getElementById('searchField').addEventListener('keyup', function (e) {
  if (!process_key(e))
    searchItem(document.getElementById('searchField').value);
});

document.getElementById('searchField').addEventListener('keydown', function (e) {
  if (currently_selected_elem() && (e.keyCode == 37 || e.keyCode == 38 || e.keyCode == 39 || e.keyCode == 40)) { // ignore up and down keys
    e.preventDefault();
    return false;
  }
});


*/