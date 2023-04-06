import fetch from "node-fetch"
import jsdom from "jsdom"
const {JSDOM} = jsdom

const monthURL = 'https://dtf.ru/rating?mode=ajax'
const threeMonthsURL = 'https://dtf.ru/rating/3month?mode=ajax'
const allURL = 'https://dtf.ru/rating/all?mode=ajax'

async function getPanhandlers(date, URL) {
    let authors = {}
    const watchedEntries = []
    let res = await fetch(URL)
    res = await res.json()
    let html = res['module.ajaxify'].html
    html = new JSDOM(html).window.document
    res = html.querySelectorAll('.l-hidden')[3].textContent
    res = JSON.parse(res)
    //res.items = [res.items[2], res.items[1], res.items[0]]
    const promises = res.items.map(async (donator) => {
        let thisAuthors = []
        const {id} = donator
        let offset = 0
        let actualComments = true
        while (actualComments) {
            let comments = await fetch(`https://api.dtf.ru/v1.9/user/${id}/comments?count=50&offset=${offset}`)

            offset += 50
            comments = (await comments.json()).result
            if (comments.length === 0) actualComments = false
            const commentPromises = comments.map(async (comment) => {
                const {dateRFC, entry, donate} = comment
                const {author} = entry
                author.value = 0
                const commentDate = new Date(dateRFC)
                if (date > commentDate) actualComments = false
                const entryId = entry.id
                if (!actualComments || !donate || watchedEntries.includes(entryId)) return author
                if (donate) {
                    watchedEntries.push(entryId)
                    let entry = await fetch(`https://api.dtf.ru/v1.9/entry/${entryId}/comments`)
                    //console.log(watchedEntries)
                    entry = (await entry.json()).result
                    entry.forEach(entryComment => {
                        if (entryComment.donate) {
                            //author.entry = entry
                            author.value += entryComment.donate.count
                        }
                    }) // outdated?

                }
                return author
            })
            const newAuthors = (await Promise.all(commentPromises)).filter(author => author.value > 0)
            thisAuthors = thisAuthors.concat(newAuthors)

        }
        return thisAuthors
        //throw new Error()
    })
    const authorsLists = await Promise.all(promises)
    authorsLists.forEach((authorsList) => {
        authorsList.forEach(author => {
            const {id} = author
            if (!(id in authors)) {
                authors[id] = author
            } else {
                authors[id].value += author.value
            }
            delete author.id
            delete author.type
            delete author.avatar
            delete author.avatar_url
            delete author.is_online
            delete author.is_verified
            delete author.is_subscribed

        })
    })
    return Object.entries(authors).sort(([, a], [, b]) => b.value - a.value).map(obj => obj[1])
}

function markdown(lines){
    let place = 0
    lines.forEach(line => {
        place += 1
        console.log(`${place}. ${place} место: [${line.name}](${line.url}) ${line.value} ₽`)
    })
}

let past = new Date()
past.setDate(1)
past.setHours(0)
past.setMinutes(0)
past.setSeconds(0)
past.setMilliseconds(0)
console.log('месяц')
getPanhandlers(past, monthURL).then((panhandlers) => {
    past = new Date()
    past.setMonth(past.getMonth() - 3)
    markdown(panhandlers)
    console.log('3 мес')
    getPanhandlers(past, threeMonthsURL).then((panhandlers) => {
        markdown(panhandlers)
        past = new Date()
        past.setMonth(past.getMonth() - 12)
        console.log('год')
        //getPanhandlers(past, allURL).then(() => { IP BAN
        //})
    })
})
