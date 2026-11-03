import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface KnowledgeBase {
  empresa: {
    nome: string
    segmento: string
    descricao: string
    moeda: string
    localizacao: string
    horarioAtendimento: string
    contatos: {
      whatsapp: string
      email: string
    }
  }
  regrasDeAtendimento: string[]
  menuPrincipal: {
    saudacao: string
    opcoes: Array<{
      codigo: string
      titulo: string
      resumo: string
    }>
  }
  servicos: Array<{
    id: string
    nome: string
    preco: string
    prazoEntrega: string
    detalhes: string
  }>
  formasDePagamento: string[]
  faq: Array<{
    pergunta: string
    palavrasChave: string[]
    resposta: string
  }>
}

export interface ChatTurn {
  role: 'user' | 'model'
  text: string
  timestamp: number
}

export interface ClientSession {
  contactId: string
  contactName: string
  history: ChatTurn[]
  lastInteractionAt: number
  lastTopic?: string
  humanHandover: boolean
  greeted: boolean
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
  }>
  error?: {
    message?: string
  }
}

const KB_PATH = path.join(__dirname, 'knowledge-base.json')
let cachedKb: KnowledgeBase | null = null
let cachedKbMtime = 0

const sessions = new Map<string, ClientSession>()

const MAX_HISTORY_TURNS = 20
const SESSION_TTL_MS = Number(process.env['BOT_SESSION_TTL_MINUTES'] || '120') * 60 * 1000

/**
 * Carrega a base de conhecimento com hot-reload automático se o arquivo for editado.
 */
export function loadKnowledgeBase (): KnowledgeBase {
  try {
    const stat = fs.statSync(KB_PATH)
    if (!cachedKb || stat.mtimeMs !== cachedKbMtime) {
      const raw = fs.readFileSync(KB_PATH, 'utf-8')
      cachedKb = JSON.parse(raw) as KnowledgeBase
      cachedKbMtime = stat.mtimeMs
    }
    return cachedKb
  } catch (err) {
    console.error('Erro ao carregar knowledge-base.json:', err)
    if (cachedKb) {
      return cachedKb
    }
    throw err
  }
}

/**
 * Obtém ou cria a sessão de memória contextual de um cliente específico.
 */
export function getOrCreateSession (contactId: string, contactName: string): ClientSession {
  const now = Date.now()
  const existing = sessions.get(contactId)

  if (existing && (now - existing.lastInteractionAt) <= SESSION_TTL_MS) {
    if (contactName && contactName !== contactId) {
      existing.contactName = contactName
    }
    return existing
  }

  const fresh: ClientSession = {
    contactId,
    contactName: contactName || 'Cliente',
    greeted: false,
    history: [],
    humanHandover: false,
    lastInteractionAt: now,
  }
  sessions.set(contactId, fresh)
  return fresh
}

function recordTurn (session: ClientSession, userText: string, botReply: string): void {
  const now = Date.now()
  session.lastInteractionAt = now
  session.history.push(
    { role: 'user', text: userText, timestamp: now },
    { role: 'model', text: botReply, timestamp: now },
  )
  if (session.history.length > MAX_HISTORY_TURNS) {
    session.history.splice(0, session.history.length - MAX_HISTORY_TURNS)
  }
}

function normalize (text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function formatMenuMessage (kb: KnowledgeBase, contactName: string): string {
  const header = kb.menuPrincipal.saudacao
    .replace('{nome}', contactName)
    .replace('{empresa}', kb.empresa.nome)

  const optionsText = kb.menuPrincipal.opcoes
    .map(op => `*${op.codigo}.* ${op.titulo}\n   _${op.resumo}_`)
    .join('\n\n')

  return [
    header,
    '',
    kb.empresa.descricao,
    '',
    'Como posso ajudar hoje? Escolha uma opção ou escreva a sua dúvida diretamente:',
    '',
    optionsText,
    '',
    '_Dica: você pode conversar normalmente comigo ou digitar *menu* a qualquer momento._',
  ].join('\n')
}

function formatServicos (kb: KnowledgeBase): string {
  const lista = kb.servicos
    .map((s, idx) => [
      `*${idx + 1}. ${s.nome}*`,
      `• *Valor:* ${s.preco}`,
      `• *Prazo:* ${s.prazoEntrega}`,
      `• *Detalhes:* ${s.detalhes}`,
    ].join('\n'))
    .join('\n\n')

  return [
    `📋 *Catálogo de Serviços — ${kb.empresa.nome}*`,
    '',
    lista,
    '',
    'Deseja saber mais detalhes ou solicitar um orçamento para algum destes serviços?',
  ].join('\n')
}

function formatComoContratar (kb: KnowledgeBase): string {
  const meios = kb.formasDePagamento.map(m => `• ${m}`).join('\n')
  return [
    '💳 *Como Contratar e Formas de Pagamento*',
    '',
    '*Passo a passo:*',
    '1. Informe qual serviço deseja contratar e a necessidade do seu negócio.',
    '2. Receba a nossa proposta comercial detalhada.',
    '3. Efetue o pagamento pelos nossos canais oficiais e envie o comprovativo.',
    '',
    '*Meios de Pagamento Aceites:*',
    meios,
    '',
    'Qual dos nossos serviços você gostaria de contratar?',
  ].join('\n')
}

function formatSuporte (kb: KnowledgeBase): string {
  return [
    `🛠️ *Suporte Técnico — ${kb.empresa.nome}*`,
    '',
    'Para agilizar o seu atendimento técnico, por favor envie:',
    '1. *Nome da empresa ou responsável*',
    '2. *Qual serviço/sistema apresenta a questão*',
    '3. *Descrição detalhada do que está a ocorrer*',
    '',
    'Se precisar falar imediatamente com um especialista humano, digite *atendente*.',
  ].join('\n')
}

function formatHorarioLocalizacao (kb: KnowledgeBase): string {
  return [
    `📍 *Horário e Contatos — ${kb.empresa.nome}*`,
    '',
    `• *Horário de Atendimento:* ${kb.empresa.horarioAtendimento}`,
    `• *Localização:* ${kb.empresa.localizacao}`,
    `• *WhatsApp:* ${kb.empresa.contatos.whatsapp}`,
    `• *E-mail:* ${kb.empresa.contatos.email}`,
    '',
    'Posso ajudar com mais alguma informação?',
  ].join('\n')
}

function buildSystemInstruction (kb: KnowledgeBase, session: ClientSession): string {
  const nowStr = new Date().toLocaleString('pt-AO', { timeZone: 'Africa/Luanda' })

  return [
    `Você é o assistente virtual oficial de atendimento ao cliente da empresa "${kb.empresa.nome}".`,
    `Data e hora atual (Luanda, Angola): ${nowStr}.`,
    `Dados do cliente atual: Nome="${session.contactName}", ID="${session.contactId}".`,
    '',
    '=== REGRAS OBRIGATÓRIAS DE PRECISÃO E CONTEXTO ===',
    ...kb.regrasDeAtendimento.map((r, i) => `${i + 1}. ${r}`),
    '',
    '=== BASE DE CONHECIMENTO OFICIAL DA EMPRESA (FONTE ÚNICA DA VERDADE) ===',
    JSON.stringify(kb, null, 2),
    '',
    '=== INSTRUÇÕES DE ESTILO ===',
    '- Responda sempre em Português claro, cordial e objetivo.',
    '- Mantenha a continuidade da conversa levando em conta o histórico anterior do cliente.',
    '- Não repita saudações longas se você já cumprimentou o cliente nos turnos anteriores.',
    '- Se o cliente pedir algo fora do escopo da base de conhecimento, diga de forma educada que essa informação específica requer validação da equipa e oriente-o a digitar *atendente*.',
  ].join('\n')
}

async function callGeminiWithContext (
  kb: KnowledgeBase,
  session: ClientSession,
  userMessage: string,
): Promise<string | null> {
  const apiKey = (process.env['GEMINI_API_KEY'] || '').trim()
  if (!apiKey || apiKey === 'sua_chave_gemini_aqui') {
    return null
  }

  const model = (process.env['GEMINI_MODEL'] || 'gemini-2.5-flash').trim()
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`

  const contents = [
    ...session.history.map(turn => ({
      parts: [ { text: turn.text } ],
      role: turn.role,
    })),
    {
      parts: [ { text: userMessage } ],
      role: 'user' as const,
    },
  ]

  try {
    const response = await fetch(url, {
      body: JSON.stringify({
        contents,
        generationConfig: {
          maxOutputTokens: 700,
          temperature: 0.2,
          topP: 0.85,
        },
        systemInstruction: {
          parts: [ { text: buildSystemInstruction(kb, session) } ],
        },
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    const data = (await response.json()) as GeminiResponse
    if (!response.ok) {
      console.error('Erro na API Gemini:', data.error?.message || response.statusText)
      return null
    }

    const replyText = data.candidates?.[0]?.content?.parts
      ?.map(p => p.text || '')
      .join('')
      .trim()

    return replyText || null
  } catch (err) {
    console.error('Falha ao consultar API Gemini:', err)
    return null
  }
}

/**
 * Motor local contextualizado de alta precisão (usado para opções diretas do menu
 * ou como fallback inteligente caso a chave GEMINI_API_KEY ainda não esteja preenchida).
 */
function localContextualFallback (
  kb: KnowledgeBase,
  session: ClientSession,
  userMessage: string,
): string {
  const norm = normalize(userMessage)

  // 1. Verifica correspondência com algum serviço específico pelo nome ou palavra-chave
  for (const servico of kb.servicos) {
    const servicoNorm = normalize(servico.nome)
    const idNorm = normalize(servico.id).replace(/-/g, ' ')
    if (
      norm.includes(servicoNorm)
      || idNorm.split(' ').every(word => word.length > 3 && norm.includes(word))
      || (norm.includes('chatbot') && servico.id.includes('whatsapp'))
      || (norm.includes('consultoria') && servico.id.includes('consultoria'))
      || (norm.includes('manutencao') && servico.id.includes('manutencao'))
    ) {
      session.lastTopic = servico.id
      return [
        `📌 *${servico.nome}*`,
        '',
        `• *Valor:* ${servico.preco}`,
        `• *Prazo de entrega:* ${servico.prazoEntrega}`,
        `• *O que inclui:* ${servico.detalhes}`,
        '',
        `Deseja avançar com a contratação deste serviço ou tem alguma dúvida específica sobre ele, *${session.contactName}*?`,
      ].join('\n')
    }
  }

  // 2. Perguntas de acompanhamento contextualizadas sobre o último serviço consultado
  if (session.lastTopic) {
    const lastService = kb.servicos.find(s => s.id === session.lastTopic)
    if (lastService) {
      if (/\b(preco|valor|custa|quanto|orcamento)\b/.test(norm)) {
        return `Sobre o serviço *${lastService.nome}*, o valor é: *${lastService.preco}*.\n\nDeseja que eu explique as formas de pagamento?`
      }
      if (/\b(prazo|tempo|demora|entrega|quando)\b/.test(norm)) {
        return `O prazo de entrega para *${lastService.nome}* é de *${lastService.prazoEntrega}*.`
      }
    }
  }

  // 3. Verifica perguntas frequentes (FAQ) na base de conhecimento
  for (const item of kb.faq) {
    const matched = item.palavrasChave.some(kw => norm.includes(normalize(kw)))
    if (matched) {
      return `💡 *${item.pergunta}*\n\n${item.resposta}`
    }
  }

  // 4. Intenções comuns (preços, pagamentos, horário, localização)
  if (/\b(preco|precos|valor|valores|catalogo|servicos|planos|pacotes)\b/.test(norm)) {
    session.lastTopic = 'catalogo'
    return formatServicos(kb)
  }

  if (/\b(pagamento|pagar|iban|multicaixa|transferencia|contratar)\b/.test(norm)) {
    session.lastTopic = 'pagamento'
    return formatComoContratar(kb)
  }

  if (/\b(horario|hora|aberto|funcionamento|localizacao|endereco|onde fica|contato|email)\b/.test(norm)) {
    session.lastTopic = 'horario'
    return formatHorarioLocalizacao(kb)
  }

  if (/\b(obrigado|obrigada|valeu|agradecido|perfeito|ok)\b/.test(norm)) {
    return `Por nada, *${session.contactName}*! Estamos sempre à disposição na *${kb.empresa.nome}*. Se precisar de mais alguma coisa, basta enviar mensagem.`
  }

  // 5. Saudação ou mensagem inicial
  if (/\b(ola|oi|boas|bom dia|boa tarde|boa noite|inicio|comecar)\b/.test(norm) || !session.greeted) {
    session.greeted = true
    return formatMenuMessage(kb, session.contactName)
  }

  // 6. Resposta padrão transparente e precisa quando não há certeza
  return [
    `Entendi a sua mensagem, *${session.contactName}*.`,
    '',
    'Para lhe dar uma resposta 100% precisa, escolha uma das opções rápidas abaixo ou digite *atendente* para falar diretamente com a nossa equipa:',
    '',
    '*1.* Catálogo de Serviços e Preços',
    '*2.* Como Contratar / Formas de Pagamento',
    '*3.* Suporte Técnico',
    '*4.* Horário e Localização',
    '*5.* Falar com Atendente Humano',
  ].join('\n')
}

/**
 * Processa a mensagem do cliente e devolve a resposta contextualizada.
 * Retorna `null` caso o cliente esteja em atendimento humano pausado.
 */
export async function generateContextualReply (
  contactId: string,
  contactName: string,
  rawText: string,
): Promise<string | null> {
  const kb = loadKnowledgeBase()
  const session = getOrCreateSession(contactId, contactName)
  const text = rawText.trim()
  const norm = normalize(text)

  // Comando para retomar o bot após atendimento humano
  if (norm === '#bot' || norm === '/bot' || norm === '/retomar' || norm === 'retomar bot') {
    session.humanHandover = false
    const reply = `🤖 O atendimento automático da *${kb.empresa.nome}* foi reativado para esta conversa.\n\nDigite *menu* para ver as opções.`
    recordTurn(session, text, reply)
    return reply
  }

  // Se o cliente está aguardando atendente humano, o bot permanece em silêncio
  // exceto se o cliente pedir explicitamente o menu de volta
  if (session.humanHandover) {
    if (norm === 'menu' || norm === '0') {
      session.humanHandover = false
    } else {
      return null
    }
  }

  // Comando de teste clássico do Wechaty
  if (norm === 'ding') {
    const reply = 'dong'
    recordTurn(session, text, reply)
    return reply
  }

  // Comando para limpar/reiniciar memória da conversa
  if (norm === '/reset' || norm === 'limpar' || norm === 'reiniciar') {
    session.history = []
    session.lastTopic = undefined
    session.greeted = true
    const reply = `🔄 Contexto da conversa reiniciado!\n\n${formatMenuMessage(kb, session.contactName)}`
    recordTurn(session, text, reply)
    return reply
  }

  // Atalhos diretos de Menu e transferência humana (determinísticos e instantâneos)
  if (norm === 'menu' || norm === '0' || norm === 'opcoes' || norm === 'ajuda') {
    session.greeted = true
    const reply = formatMenuMessage(kb, session.contactName)
    recordTurn(session, text, reply)
    return reply
  }

  if (norm === '1') {
    session.greeted = true
    session.lastTopic = 'catalogo'
    const reply = formatServicos(kb)
    recordTurn(session, text, reply)
    return reply
  }

  if (norm === '2') {
    session.greeted = true
    session.lastTopic = 'pagamento'
    const reply = formatComoContratar(kb)
    recordTurn(session, text, reply)
    return reply
  }

  if (norm === '3') {
    session.greeted = true
    session.lastTopic = 'suporte'
    const reply = formatSuporte(kb)
    recordTurn(session, text, reply)
    return reply
  }

  if (norm === '4') {
    session.greeted = true
    session.lastTopic = 'horario'
    const reply = formatHorarioLocalizacao(kb)
    recordTurn(session, text, reply)
    return reply
  }

  if (
    norm === '5'
    || norm === 'atendente'
    || norm === 'humano'
    || norm === 'falar com atendente'
    || norm === 'falar com humano'
  ) {
    session.humanHandover = true
    const reply = [
      '👤 *Transferência para Atendente Humano*',
      '',
      `Certo, *${session.contactName}*! Pausei o assistente automático nesta conversa e notifiquei a nossa equipa.`,
      'Um especialista irá responder por aqui em instantes (Horário: ' + kb.empresa.horarioAtendimento + ').',
      '',
      '_Caso queira voltar ao assistente automático a qualquer momento, digite *menu* ou *#bot*._',
    ].join('\n')
    recordTurn(session, text, reply)
    return reply
  }

  // Consulta o modelo Gemini com todo o histórico do cliente + Base de Conhecimento
  const aiReply = await callGeminiWithContext(kb, session, text)
  if (aiReply) {
    session.greeted = true
    recordTurn(session, text, aiReply)
    return aiReply
  }

  // Fallback contextualizado local baseado na Knowledge Base
  const fallbackReply = localContextualFallback(kb, session, text)
  session.greeted = true
  recordTurn(session, text, fallbackReply)
  return fallbackReply
}
