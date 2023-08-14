# browser-history-sync
chrome extension for sync history between devices

## backend usage
```
git pull https://github.com/zlynx2099/browser-history-sync.git
docker build . -t browser-sync-backend
docker run -p 8000:8080 -v $CWD:/app browser-sync-backend
```
## browser usage
load extension from "browser-sync-chromev2" folder

# todo
- [ ] UI Beautify
- [ ] Account.ChangePassword
- [ ] Kiwi UI Adaption
- [ ] Firefox Support
- [ ] ...
