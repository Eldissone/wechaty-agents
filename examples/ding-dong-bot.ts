/**
 *   Wechaty Chatbot SDK - https://github.com/wechaty/wechaty
 *
 *   @copyright 2016 Huan LI (李卓桓) <https://github.com/huan>, and
 *                   Wechaty Contributors <https://github.com/wechaty>.
 *
 *   Licensed under the Apache License, Version 2.0 (the "License");
 *   you may not use this file except in compliance with the License.
 *   You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 *   Unless required by applicable law or agreed to in writing, software
 *   distributed under the License is distributed on an "AS IS" BASIS,
 *   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *   See the License for the specific language governing permissions and
 *   limitations under the License.
 *
 */
import 'dotenv/config.js'
import {
  WechatyBuilder,
  ScanStatus,
  Message,
  Contact,
}                     from '../src/mods/mod.js' // from 'wechaty'

import qrTerm from 'qrcode-terminal'
import {
  generateContextualReply,
  loadKnowledgeBase,
}                     from './atendimento-ai.js'

const options = {
  name : 'ding-dong-bot',
}

const bot = WechatyBuilder.build(options)

bot
  .on('logout', onLogout)
  .on('login',  onLogin)
  .on('scan',   onScan)
  .on('error',  onError)
  .on('message', onMessage)
  .start()
  .catch(async e => {
    console.error('Bot start() fail:', e)
    await bot.stop()
    process.exit(-1)
  })

function onScan (qrcode: string, status: ScanStatus) {
  if (status === ScanStatus.Waiting || status === ScanStatus.Timeout) {
    qrTerm.generate(qrcode, { small: true })

    const qrcodeImageUrl = [
      'https://wechaty.js.org/qrcode/',
      encodeURIComponent(qrcode),
    ].join('')

    console.info('onScan: %s(%s) - %s', ScanStatus[status], status, qrcodeImageUrl)
  } else {
    console.info('onScan: %s(%s)', ScanStatus[status], status)
  }
}

function onLogin (user: Contact) {
  const kb = loadKnowledgeBase()
  const hasGemini = Boolean(
    process.env['GEMINI_API_KEY']
    && process.env['GEMINI_API_KEY'] !== 'sua_chave_gemini_aqui',
  )
  console.info(`${user.name()} login`)
  console.info(`✅ Atendimento Contextualizado Ativo: ${kb.empresa.nome}`)
  console.info(`🧠 Motor IA Gemini (${process.env['GEMINI_MODEL'] || 'gemini-2.5-flash'}): ${hasGemini ? 'ATIVO' : 'MODO HÍBRIDO LOCAL (defina GEMINI_API_KEY no .env para ativar a IA)'}`)
}

function onLogout (user: Contact) {
  console.info(`${user.name()} logged out`)
}

function onError (e: Error) {
  console.error('Bot error:', e)
}

async function onMessage (msg: Message) {
  console.info(msg.toString())

  if (msg.self()) {
    return
  }

  if (msg.age() > 2 * 60) {
    console.info('Mensagem ignorada por ter mais de 2 minutos')
    return
  }

  // Ignora grupos por padrão (a menos que BOT_IGNORE_GROUPS=false no .env)
  if (msg.room() && process.env['BOT_IGNORE_GROUPS'] !== 'false') {
    return
  }

  if (msg.type() !== bot.Message.Type.Text) {
    return
  }

  const text = msg.text().trim()
  if (!text) {
    return
  }

  const talker = msg.talker()
  const contactId = talker.id
  const contactName = talker.name() || 'Cliente'

  const reply = await generateContextualReply(contactId, contactName, text)
  if (!reply) {
    console.info(`[Atendimento Humano Ativo] Mensagem de ${contactName} aguarda resposta humana.`)
    return
  }

  await msg.say(reply)
  console.info(`RESPOSTA para ${contactName}: ${reply.replace(/\n+/g, ' | ')}`)
}

const welcome = `
| __        __        _           _
| \\ \\      / /__  ___| |__   __ _| |_ _   _
|  \\ \\ /\\ / / _ \\/ __| '_ \\ / _\` | __| | | |
|   \\ V  V /  __/ (__| | | | (_| | |_| |_| |
|    \\_/\\_/ \\___|\\___|_| |_|\\__,_|\\__|\\__, |
|                                     |___/

=============== Powered by Wechaty ===============
-------- Atendimento Contextualizado & IA --------
          Version: ${bot.version()}

Iniciando o assistente de atendimento no WhatsApp...
`
console.info(welcome)
