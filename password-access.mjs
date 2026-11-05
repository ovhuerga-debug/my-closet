export function initPasswordAccess({client,onSignedIn,redirectTo}){
 const $=id=>document.getElementById(id);
 let working=false;
 const clear=()=>{for(const id of ['loginPassword','newPassword','repeatPassword'])$(id).value=''};
 function lock(value){working=value;for(const id of ['passwordLogin','send','savePassword'])$(id).disabled=value}
 $('passwordForm').onsubmit=async event=>{
 event.preventDefault();if(working||!$('passwordForm').reportValidity())return;lock(true);$('authMsg').textContent='Entrando…';
 try{const {error}=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('loginPassword').value});if(error)throw error;clear();$('authMsg').textContent='';await onSignedIn()}
 catch(error){$('loginPassword').value='';$('authMsg').textContent='No se pudo entrar. Comprueba tu correo y contraseña o usa el enlace de acceso. '+error.message}
 finally{lock(false)}
 };
 $('send').onclick=async()=>{
 if(working||!$('email').reportValidity())return;lock(true);$('authMsg').textContent='Enviando enlace…';
 try{const {error}=await client.auth.signInWithOtp({email:$('email').value.trim(),options:{emailRedirectTo:redirectTo()}});if(error)throw error;$('authMsg').textContent='Comprueba tu correo. Tras entrar, abre «Mi contraseña» para crearla y no necesitar más enlaces.'}
 catch(error){$('authMsg').textContent='No se pudo enviar el enlace: '+error.message}
 finally{lock(false)}
 };
 $('setPasswordForm').onsubmit=async event=>{
 event.preventDefault();if(working||!$('setPasswordForm').reportValidity())return;
 if($('newPassword').value!==$('repeatPassword').value){$('passwordStatus').textContent='Las contraseñas no coinciden.';return}
 lock(true);$('passwordStatus').textContent='Guardando contraseña…';
 try{const {data:{user},error:authError}=await client.auth.getUser();if(authError)throw authError;if(!user)throw Error('Entra con tu enlace antes de crear la contraseña.');
 const {error}=await client.auth.updateUser({password:$('newPassword').value});if(error)throw error;clear();$('passwordStatus').textContent='Contraseña guardada. Podrás entrar con tu correo y contraseña. La sesión se conserva en este dispositivo.'}
 catch(error){$('passwordStatus').textContent='No se pudo guardar: '+error.message+' Si se requiere acceso reciente, entra con un nuevo enlace y vuelve a intentarlo.'}
 finally{clear();lock(false)}
 };
 return {clear};
}
