// import fetch from 'node-fetch'
import { exec } from 'child_process'

/**
 * @param  {string} command The command to test.
 * @returns Promise<boolean>
 */
async function commandExists(command: string): Promise<boolean> {
    return new Promise((resolve) => {
        let cmd = exec(command, (err) => {
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

