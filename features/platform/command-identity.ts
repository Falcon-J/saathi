import {createHash} from 'node:crypto'
import {z} from 'zod'
const identity=z.strictObject({actorId:z.uuid(),clientId:z.string().min(1).max(200),commandId:z.uuid()})
/** Internal receipts predate OAuth clients. Keep their UUID namespace isolated by the
 * verified actor/client while preserving the external command ID in the public envelope. */
export function toDomainCommandId(actorId:string,clientId:string,externalCommandId:string):string{
 const value=identity.parse({actorId,clientId,commandId:externalCommandId})
 const hex=createHash('sha256').update(JSON.stringify(['saathi-domain-command-v1',value.actorId.toLowerCase(),value.clientId,value.commandId.toLowerCase()])).digest('hex')
 const variant=((Number.parseInt(hex[16],16)&3)|8).toString(16)
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-8${hex.slice(13,16)}-${variant}${hex.slice(17,20)}-${hex.slice(20,32)}`
}
