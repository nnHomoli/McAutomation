const os = require('os')
const fs = require('fs');
const https = require('https');
const tar = require('tar');

const mainLoggerPrefix = "//SERVER_UPDATER:"
const mainLogger = console.log.bind(console,mainLoggerPrefix)
const mainLoggerWarn = console.warn.bind(console,mainLoggerPrefix)
const mainLoggerErr = console.error.bind(console,mainLoggerPrefix)

const loadedAsMain = require.main.children.values().next().value.loaded

const compatibleArch = ["aarch64","x64"]

async function main() {
    let arch = os.arch()
    if(arch === 'arm64') arch = "aarch64"
    if(!compatibleArch.includes(arch)) {
        mainLoggerErr("Machine architecture incompatible")
        return
    }

    mainLogger("Checking Internet connection...")
    if(!await isConnected("https://papermc.io/")) {
        mainLoggerErr("Currently offline, please check your internet connection")
        return
    }

    if(!fs.existsSync("versions.json") || fs.statSync("versions.json").size === 0) {
        fs.writeFileSync("versions.json", '{"java":0,"server":"0","build":"0"}')
    }

    const versions = JSON.parse(fs.readFileSync("versions.json", "utf8"));

    const latest = await getLatestPurpurMC();
    const latestJava = await getNeededJava(latest)
    const latestBuild = await getLatestSuccessfulBuild(latest)


    if(versions.server !== "0") mainLogger("Current server version is " + versions.server + " build " + versions.build)
    else mainLoggerWarn("No installed server version was written, if it's initial setup this is normal")
    if(versions.java !== 0) mainLogger("Current JDK version is " + versions.java)
    else mainLoggerWarn("No installed JDK version was written, if it's initial setup this is normal")


    let anyUpdates = false
    if(latest !== versions.server || latestBuild !== versions.build) {
        anyUpdates = true
        const loggerPrefix = "//SERVER_UPDATER/CORE:"
        const logger = console.log.bind(console,loggerPrefix)
        const loggerErr = console.error.bind(console,loggerPrefix)

        logger("Downloading version " + latest + " build " + latestBuild + "...");
        await downloadFile( arch,"purpur","server.jar",latest,latestBuild).then(() => {
            versions.server = latest
            versions.build = latestBuild
            fs.writeFileSync("versions.json",JSON.stringify(versions))

            logger("Successfully downloaded");
        }).catch(r => loggerErr("Failed to download -- " + r))
    }

    if(latestJava > versions.java) {
        anyUpdates = true
        const loggerPrefix = "//SERVER_UPDATER/JDK:"
        const logger = console.log.bind(console,loggerPrefix)
        const loggerErr = console.error.bind(console,loggerPrefix)

        logger("Downloading " + latestJava + "...")

        const path = "jdk.tar.gz"
        const outputFolder = "jdk"
        await downloadFile(arch,"jdk", path, latestJava).then(() =>{
            logger("Successfully downloaded");
        }).catch(r => loggerErr("Failed to download -- " + r))

        logger("Extracting JDK...")
        await extractJDK(path,outputFolder).then(() => {
            versions.java = latestJava
            fs.writeFileSync("versions.json", JSON.stringify(versions))

            logger("Successfully extracted JDK");
        }).catch(r => loggerErr("Failed to extract -- " + r))
    }

    if(anyUpdates) mainLogger("All done with updating/installing server")
    else mainLogger("Server is up to date")
}

async function getLatestPurpurMC() {
    const response = await fetch('https://api.purpurmc.org/v2/purpur');
    const data = await response.json();
    return data.versions[data.versions.length - 1]
}

async function getLatestSuccessfulBuild(mcVersion) {
    const path = `https://api.purpurmc.org/v2/purpur/${mcVersion}/`
    const response  = await fetch(path)
    const data = await response.json()

    for (let i = data.builds.all.length - 1; i >= 0; i--) {
        const build = await fetch(path + data.builds.all[i])
        const buildData = await build.json()
        if (buildData.result === "SUCCESS") {
            return buildData.build
        }
    }
}

async function getNeededJava(mcVersion) {
    const response  = await fetch("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json")
    const data = await response.json()
    const versionList = data.versions
    let versionURL = null
    for (let version in versionList) {
        if (versionList[version].id === mcVersion) {
            versionURL = versionList[version].url
        }
    }

    if (versionURL === null) {
        throw "Version package not found"
    } else {
        const packageURL = await fetch(versionURL)
        const pkg = await packageURL.json()

        return pkg.javaVersion.majorVersion
    }
}

function extractJDK(fromPath, outputFolder) {
    return new Promise(async (resolve) => {
        let folder = ""
        await tar.x({
            file: fromPath,
            onReadEntry: (entry) => {
                folder = entry.path.substring(0, entry.path.indexOf("/"))
            }
        }).then(_ => {
            if (fs.existsSync(outputFolder)) {
                fs.rmSync(outputFolder, {recursive: true})
            }
            fs.renameSync(folder, outputFolder)
            fs.rmSync(fromPath)

            resolve()
        })
    })
}

function downloadFile(arch,type,output,version,build=null) {
    return new Promise((resolve) => {
        if(type === "jdk") {
            const javaURL = `https://download.oracle.com/java/${version}/latest/jdk-${version}_linux-${arch}_bin.tar.gz`;

            https.get(javaURL, async (res) => {
                const file = fs.createWriteStream("jdk.temp");
                res.pipe(file);
                file.on('finish', () => {
                    file.close();

                    fs.renameSync("jdk.temp", output)
                    resolve()
                });
                file.on('error', (err) => {
                    throw "Failed to download " + err
                })
            })

        } else if(build !== null && type === "purpur") {
            const url = `https://api.purpurmc.org/v2/purpur/${version}/${build}/download`;
            https.get(url, async (res) => {
                const file = fs.createWriteStream("server.temp");
                res.pipe(file);
                file.on('finish', () => {
                    file.close();

                    fs.renameSync("server.temp", output)
                    resolve()
                });
                file.on('error', (err) => {
                    throw "Failed to download " + err
                })
            })
        } else {throw("No such type exists or build for Purpur wasn't provided") }
    })
}


function isConnected(urlToCheck) {
    return new Promise( (resolve) => {
        fetch(urlToCheck).then(r => {
            if (r.ok) {
                resolve(true)
            } else {
                resolve(false)
            }
        }).catch(r => resolve(false))
    })
}

module.exports = {
    isConnected
}

if(loadedAsMain) {
    mainLogger("Made by nnHomoli")

    if(process.argv[2] !== undefined && fs.existsSync(process.argv[2])) {
        mainLogger("Changing working directory to " + process.argv[2])
        process.chdir(process.argv[2])
    }
    main()
}
