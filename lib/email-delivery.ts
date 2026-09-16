export type EmailRequest={from:string;to:string[];subject:string;text:string;html?:string}
export type Delivery={status:"sent";providerId:string}|{status:"retry"|"failed";category:string}
export async function deliverInvitationEmail(id:string,payload:EmailRequest,key:string,send:typeof fetch=fetch):Promise<Delivery>{
  try{
    const response=await send("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json","Idempotency-Key":id},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)})
    if(!response.ok)return {status:response.status===429||response.status===409||response.status>=500?"retry":"failed",category:`PROVIDER_${response.status}`}
    const data:unknown=await response.json()
    if(!data||typeof data!=="object"||!("id" in data)||typeof data.id!=="string")return {status:"retry",category:"INVALID_RESPONSE"}
    return {status:"sent",providerId:data.id}
  }catch{return {status:"retry",category:"OUTCOME_UNKNOWN"}}
}
export function mayRetryEmail(firstAttempt:Date|null,now=Date.now()){return !firstAttempt||now-firstAttempt.getTime()<23*60*60*1000}
