import childProcess from 'child_process'
import EventEmitter from 'events';
import fs from 'fs'

interface Player {
    name: string,
    uuid: string,
    ip: string,
    port: string,
    entityId: string,
    loginCoordinates: [number, number, number]
}

let previousLog = ""
let currentLog = ""
function startLogging(server: Server) {
    server.on('info', message => {
        previousLog = currentLog
        currentLog = message
    })
}

export class Server extends EventEmitter {
    /**
     * Location of the JAR file being run.
     */
    location: string
    /**
     * Detected version of the server.
     */
    version?: string
    /**
     * Detected default gamemode of the server.
     */
    defaultGameMode?: string
    /**
     * Detected IP the server's listening on.
     */
    ip?: string
    /**
     * Detected port the server's listening on.
     */
    port?: number
    /**
     * Detected world the server has loaded.
     */
    world?: string
    /**
     * Percent of world loaded. (Might be inaccurate).
     */
    preparePercentage?: number = 0
    /**
     * The server's status.
     */
    ready: boolean = false
    _process

    /**
     * Player list ([{name: uuid}])
     */
    players: Array<Player> = []

    /**
     * Send console command to the server.
     * 
     * @param command The command to send it to the server.
     * @param vanilla If the command is vanilla or not. If this is set to true the script will try to detect if the command succeeded or not.
     * @returns Promise [next line of stdout, success]
     */
    async sendCommand (command: string, vanilla: boolean = false): Promise<[string, boolean | null]> {
        return new Promise((resolve, reject) => {
            if (!this.ready) {
                reject("The server is not ready yet!")
            }
            if (!vanilla) {
                this._process.stdin.write(command + "\n")
                setTimeout(() => {this.once('info', message => {resolve([message, null])})}, 50)
            }
            else {
                this._process.stdin.write("data remove storage jsapi success\n")
                // Wait a tick
                setTimeout(() => {
                    this._process.stdin.write("execute store success storage jsapi success int 1 run " + command + "\n")
                    setTimeout(() => {
                        this.once('info', () => {
                            this._process.stdin.write("data get storage jsapi success\n")
                            let finalSuccess: boolean
                            let lookForChange = (success: string) => {
                                if (success.startsWith("Storage minecraft:jsapi has the following contents: ")) {
                                    switch (parseInt(success.substring(52))) {
                                        case 0:
                                            finalSuccess = false
                                            break
                                        case 1:
                                            finalSuccess = true
                                            break
                                    }
                                    resolve([previousLog, finalSuccess])
                                    this.removeListener('info', lookForChange)
                                }
                                else if (success === "Found no elements matching success") {
                                    reject("Invalid command")
                                    this.removeListener('info', lookForChange)
                                }
                            }
                            this.on('info', lookForChange)
                        })
                    }, 50)
                }, 50)
            }
        })
    }
    /**
     * Stops the server.
     * 
     * @returns Promise
     */
    async stop(): Promise<void> {
        return new Promise(resolve => {
            this.sendCommand("stop")
            this._process.on('exit', () => {
                resolve()
            })
        })
    }

    constructor (options: {
        location: string
        process: any
    }) {
        super()
        this.location = options.location
        this._process = options.process
    }
}

/**
 * @param  {string} command The command to test.
 * @returns Promise<boolean>
 */
async function commandExists(command: string): Promise<boolean> {
    return new Promise((resolve) => {
        let cmd = childProcess.exec(command, (err) => {
            if (err) {resolve(false)} else {resolve(true)}
            cmd.kill()
        })
    })
}

/**
 * Tests if java can be run.
 * Runs "java -version".
 * 
 * @returns Promise<boolean>
 */
export function javaExists(): Promise<boolean> {
    return commandExists("java -version")
}

/**
 * Launches a minecraft server
 * 
 * @param  {string} location The location of the .jar file.
 * @returns Promise
 */
export async function launch(location: string): Promise<Server> {
    return new Promise((resolve, reject) => {
        if (!location) return reject("No location provided")
        if (!location.endsWith(".jar")) {
            return reject("The argument passed to the function is not a jar file.")
        }
        
        if (!fs.existsSync(location)) {
            return reject("That location does not exist.")
        }

        let instance = childProcess.spawn('java', ["-jar", location, "nogui"], {
            cwd: location.split("/").slice(0, location.split("/").length - 1).join("/")
        })

        let server = new Server({location, process: instance})

        instance.on('spawn', () => resolve(server))

        instance.stdout.on('data', data => {
            let message: string = data.toString().trim()
            if (message.includes("\n")) {
                message.split("\n").forEach(message => parseStdout(message, server))
            }
            else {
                parseStdout(message, server)
            }
        })

    })
}

/**
 * Parses time that's formatted as 12:12:12
 * 
 * @param  {string} time
 * @returns Date
 */
function parseTime(time: string): Date {
    let timeStringArray = time.split(":")
    let timeNumberArray: Array<number> = []
    let ms = 0
    timeStringArray.forEach(time => {
        timeNumberArray.push(parseInt(time))
    })

    timeNumberArray.forEach((time, index) => {
        switch (index) {
            case 0:
                ms += time * 60 * 60
                break;
            case 1:
                ms += time * 60
                break;
            case 2:
                ms += time
                break;
            default:
                debugger
        }
    })

    return new Date(ms)
}

let partialUsers: Array<{
    name: string,
    uuid: string,
    ip?: string,
    port?: string,
    entityId?: string,
    loginCoordinates?: [number, number, number]
}> = []

function predefinedMessages(message: string, server: Server, thread: string): void {

    if (message.startsWith("Environment: ")) {
        message = message.substring(13)
        let values = message.split(",")
        let env: {[key: string]: string} = {
            authHost :  "",
            accountsHost : "",
            sessionHost : "",
            servicesHost : "",
            name : "",
        }
        values.forEach(value => {
            value = value.trim().replace("'", "").replace("'", "")
            let values = value.split("=")
            env[values[0]] = values[1]
        })
        server.emit('environment', env)
    }

    if (message.startsWith("Starting minecraft server version ")) {
        server.version = message.substring(34)
        server.emit('version', server.version)
    }

    if (message.startsWith("Starting Minecraft server on ")) {
        server.emit("listen", message.substring(29))
        server.ip = message.substring(29, message.indexOf(":"))
        server.emit("ip", server.ip)
        server.port = parseInt(message.substring(message.indexOf(":") + 1))
        server.emit("port", server.port)
    }

    if (message.startsWith('Preparing level "')) {
        server.world = message.substring(17,message.lastIndexOf('"'))
        server.emit("world", server.world)
    }

    if (message.startsWith("Preparing spawn area: ")) {
        server.preparePercentage = parseInt(message.substring(22, message.indexOf("%")))
        server.emit("preparing", server.preparePercentage)
    }

    if (message.startsWith("Done ")) {
        startLogging(server)
        server.ready = true
        server.emit("ready", parseFloat(message.substring(message.indexOf("(") + 1, message.indexOf(")") - 1)))
    }

    if (message.startsWith("Can't keep up! Is the server overloaded? Running ")) {
        server.emit("lag", parseInt(message.substring(49), message.indexOf("m",49)))
    }

    if (message.startsWith("Default game type: ")) {
        server.defaultGameMode = message.substring(19)
        server.emit("gamemode", server.defaultGameMode)
    }

    if (message.startsWith("UUID of player ") && thread.startsWith("User Authenticator")) {
        partialUsers.push({
            name: message.substring(15, message.indexOf(" ", 15)),
            uuid: message.substring(message.lastIndexOf(" ") + 1)
        })
    }

    if (message.includes("logged in with entity id") && thread === "Server thread") {
        partialUsers.forEach((user, index, array) => {
            if (user.name === message.substring(0, message.indexOf("["))) {
                array.splice(index, 1)
                user.ip = message.substring(message.indexOf("/") + 1, message.indexOf(":"))
                user.port = message.substring(message.indexOf(":") + 1, message.indexOf("]"))
                user.entityId = message.substring(message.indexOf(" logged in with entity id ") + 26, message.indexOf(" ", message.indexOf(" logged in with entity id ") + 26))
                user.loginCoordinates = message.substring(message.indexOf("(") + 1, message.indexOf(")")).split(", ").map(coord => {return parseFloat(coord)}) as [number, number, number]
                server.players?.push(user as Player)
            }
        })
    }

    if (message.endsWith(" joined the game") && thread === "Server thread") {
        server.emit("join", server.players.find(player => {return player.name === message.substring(0, message.indexOf(" "))}))
    }

    switch (message) {
        case 'You need to agree to the EULA in order to run the server. Go to eula.txt for more info.':
            throw "You need to agree to the minecraft EULA before you can run a server."
        case 'Failed to start the minecraft server':
            throw "The minecraft server failed to start"
    }
}

/**
 * Parses the stdout of a minecraft server.
 * 
 * @param  {string} stdout
 * @param  {Server} server
 */
function parseStdout(stdout: string, server: Server) {
    let timestamp = parseTime(stdout.substring(stdout.indexOf("[") + 1, stdout.indexOf("]")))
    stdout = stdout.substring(11)
    let thread = stdout.substring(1, stdout.indexOf("/"))
    let messageType = stdout.substring(stdout.indexOf("/") + 1, stdout.indexOf("]"))
    stdout = stdout.substring(stdout.indexOf("]") + 3)
    predefinedMessages(stdout, server, thread)
    server.emit(messageType.toLowerCase(), stdout, thread, timestamp)
}