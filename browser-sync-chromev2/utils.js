var storageUtil = {
    get: async (key) => {
        var value = localStorage.getItem(key)
        return value?JSON.parse(value):null
    },
    set: async (key,value) => {
        localStorage.setItem(key,JSON.stringify(value))
    }
}