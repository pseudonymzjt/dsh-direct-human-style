import fs from 'node:fs'
const text = fs.readFileSync('_page.txt', 'utf8')
const lines = text.split('\n').filter(Boolean)

const ordinal = /(结论|优化|架构|局限|路径|路线|边界|假设)[一二三四五六七八九十]/g
console.log('序数骨架:', JSON.stringify(text.match(ordinal)))
console.log('序数计数:', (text.match(ordinal)||[]).length)

const labelOpen = lines.filter(l => /^[^。！？：\n]{2,10}：/.test(l))
console.log('标签冒号开头的块:', labelOpen.length)
for (const l of labelOpen.slice(0,8)) console.log('   ', l.slice(0,40))

const boldLead = lines.filter(l => /^[^\n]{6,40}。\s/.test(l.trim()))
console.log('短句加粗标签式开头(前一句<40字):', boldLead.length)

const notXish = text.match(/不是[^。\n]{1,25}[，,]\s*是[^。\n]{1,25}/g) || []
console.log('不是…是…:', notXish.length)

const isXnotY = text.match(/是[^。\n，,]{2,20}[，,]\s*不是[^。\n]{2,20}/g) || []
console.log('是…，不是…(反序):', isXnotY.length, JSON.stringify(isXnotY.slice(0,3)))

const pia = text.match(/恰恰相反|正相反|相反地/g) || []
console.log('恰恰相反类转折:', pia.length)

console.log('段落数:', lines.length)
const lens = lines.map(l => l.length).filter(n => n > 40)
const mean = lens.reduce((a,b)=>a+b,0)/lens.length
const sd = Math.sqrt(lens.reduce((a,b)=>a+(b-mean)**2,0)/lens.length)
console.log('长段落 mean', mean.toFixed(1), 'sd', sd.toFixed(1), 'cv', (sd/mean).toFixed(2))
