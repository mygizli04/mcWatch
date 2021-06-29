
const minecraft = require('../lib/index.js');

let server

async function ready() {
    return new Promise(resolve => {
        server.on('ready', () => {
            resolve()
        })
    })
}

describe('Check if the server can be interfaced with', () => {

    beforeAll(async () => {
        server = await minecraft.launch('/users/berke/desktop/server/server.jar')
        await ready()
    }, 180000)

    afterAll(() => {
        server._process.kill()
    })

    it('can send commands to the server', async () => {
        await expectAsync(server.sendCommand("say hi", false)).toBeResolvedTo(["[Server] hi", null])
    })

    it('can check if a vanilla command was completed successfully', async () => {
        await expectAsync(server.sendCommand("say hi", true)).toBeResolvedTo(["[Server] hi", true])
    })

    it('can check if a vanilla command failed', async () => {
        await expectAsync(server.sendCommand("ban e", true)).toBeResolvedTo(["That player does not exist", false])
    })

    it('can check if a vanilla command does not exist', async () => {
        await expectAsync(server.sendCommand("e", true)).toBeRejectedWith("Invalid command")
    })
})