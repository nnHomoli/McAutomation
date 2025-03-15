const serverUpdater = require("./UpdateServer")
const fs = require("fs")
const https = require("https")

const pluginsPath = process.cwd() + "/plugins/"

let plugins = null
let versionsServer = null;
let supportedLoaders = ["spigot","bukkit","paper","purpur"]

let pluginLogger
let pluginLoggerWarn
let pluginLoggerErr

const mainLoggerPrefix = "//PLUGIN_UPDATER:"
const mainLogger = console.log.bind(console,mainLoggerPrefix)
const mainLoggerWarn = console.warn.bind(console,mainLoggerPrefix)
const mainLoggerErr = console.error.bind(console,mainLoggerPrefix)

const loadedAsMain = require.main.children.values().next().value.loaded

async function main(){
    mainLogger("Checking Internet connection...")
    if(!await serverUpdater.isConnected("https://api.modrinth.com/")) {
        mainLoggerErr("Currently offline, please check your internet connection")
        return
    }

    if(!fs.existsSync("versions.json") || fs.statSync("versions.json").size === 0) {
        mainLoggerErr("No SERVER_UPDATER data found or it is empty, this script supposed to work in pair with it")
        return
    }
    if(!fs.existsSync("pluginVersions.json") || fs.statSync("pluginVersions.json").size === 0) {
        await fs.writeFileSync("pluginVersions.json", '{"example":"1.0"}')
        mainLogger("Created pluginVersions.json, please look in there to see how to add auto-updating plugins")
        return
    }

    plugins = JSON.parse(fs.readFileSync("pluginVersions.json", "utf8"));
    versionsServer = JSON.parse(fs.readFileSync("versions.json", "utf8"));

    for(let plugin in plugins) {
        const loggerPrefix = `//PLUGIN_UPDATER/${plugin}:`
        pluginLogger = console.log.bind(console,loggerPrefix)
        pluginLoggerWarn = console.warn.bind(console,loggerPrefix)
        pluginLoggerErr = console.error.bind(console,loggerPrefix)

        if(plugin === undefined || plugin === "example") continue

        mainLogger("Checking for new version of " + plugin)
        const url = await fetch(`https://api.modrinth.com/v2/project/${plugin}`)
        if(url.ok) {
            const pluginJson = await url.json()
            if(pluginJson.game_versions.includes(versionsServer.server)) {
                await FindAndDownloadFile(pluginJson, plugin)
            } else if(!pluginJson.game_versions.includes(versionsServer.server)) {
                pluginLoggerWarn("still yet to be available on " + versionsServer.server)
                if(fs.existsSync(pluginsPath + plugin + ".jar")) fs.rmSync(pluginsPath + plugin + ".jar")
            }
        }
    }
}



async function FindAndDownloadFile(pluginJson, plugin) {
    for (let i = pluginJson.versions.length - 1; i >= 0; i--) {
        const vURL = await fetch(`https://api.modrinth.com/v2/version/${pluginJson.versions[i]}`)
        const data = await vURL.json()

        if(data.game_versions.includes(versionsServer.server)) {
            if(plugins[plugin] === data.version_number && fs.existsSync(pluginsPath + plugin + ".jar")) {
                pluginLogger("up to date!")
                return
            }

            let supported = false
            for(let l in supportedLoaders) {
                if(data.loaders.includes(supportedLoaders[l])) {
                    supported = true
                }
            }

            if(!supported) continue


            pluginLogger("New version found -- " + data.version_number)
            for(let f in data.files) {

                if(data.files[f].primary) {
                    pluginLogger("Downloading...")

                    https.get(data.files[f].url, (res) => {
                        if(!fs.existsSync(pluginsPath)) fs.mkdirSync(pluginsPath)
                        const file = fs.createWriteStream(pluginsPath + plugin + ".temp");
                        res.pipe(file);
                        file.on('finish', () => {
                            file.close();
                            fs.renameSync(pluginsPath + plugin + ".temp", pluginsPath + plugin + ".jar")

                            plugins[plugin] = data.version_number
                            fs.writeFileSync("pluginVersions.json",JSON.stringify(plugins))
                            pluginLogger("Successfully updated");
                        });
                        file.on('error', (err) => {
                            pluginLoggerErr("Failed to download - " + err)
                        })})
                    return
                }
            }
        }
    }
}

if(loadedAsMain) {
    mainLogger("Made by nnHomoli")
    main()
}