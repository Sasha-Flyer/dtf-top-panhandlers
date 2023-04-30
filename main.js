import fetch from "node-fetch"
import jsdom from "jsdom"
import fs from "fs"

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
                const {dateRFC, donate} = comment
                const entryBase = comment.entry
                const {author} = entryBase
                if (entryBase.title === '') entryBase.title = 'Безымяный пост'
                author.value = 0
                author.entries = []
                author.donators = {}
                const commentDate = new Date(dateRFC)
                if (date > commentDate) actualComments = false
                const entryId = entryBase.id
                if (!actualComments || !donate || watchedEntries.includes(entryId)) return author
                if (donate) {

                    watchedEntries.push(entryId)
                    let entry = await fetch(`https://api.dtf.ru/v1.9/entry/${entryId}/comments`)
                    //console.log(watchedEntries)
                    entry = (await entry.json()).result
                    entry.forEach(entryComment => {
                        if (entryComment.donate) {


                            if (author.entries.length) author.entries[0].value += entryComment.donate.count
                            else author.entries = [{
                                id: entryBase.id,
                                url: entryBase.url,
                                title: entryBase.title,
                                value: entryComment.donate.count
                            }]
                            author.value += entryComment.donate.count

                            if (!(entryComment.author.id in author.donators)) {
                                author.donators[entryComment.author.id] = {
                                    name: entryComment.author.name,
                                    value: entryComment.donate.count
                                }
                            } else {
                                author.donators[entryComment.author.id].value += entryComment.donate.count
                            }

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
                authors[id].entries = authors[id].entries.concat(author.entries)
                for (const [key, donator] of Object.entries(author.donators)) {
                    if (!(key in authors[id].donators)) {
                        authors[id].donators[key] = donator
                    } else {
                        authors[id].donators[key].value += donator.value
                    }
                }
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

function markdown(lines) {
    let entries = []
    let place = 0
    let out = ''
    lines.forEach(line => {
        entries = entries.concat(line.entries)
        //console.log(line)
        place += 1
        let text = `${place}. ${place} место: [${line.name}](${line.url}) ${line.value}₽. Посты с донатом: `
        let i = 1
        line.entries.forEach(entry => {
            text += `[Пост${i}: ${entry.value}₽](${entry.url}) `
            i++
        })
        text += ". Донатеры: "
        Object.values(line.donators).forEach(donator => {
            text += `${donator.name}: ${donator.value}₽ `

        })
        out += text + '\n'
    })
    fs.writeFileSync('users.md', out)

    lines.sort((a, b) => {
        return b.entries.length - a.entries.length
    })
    place = 0
    out = ''
    lines.forEach(line => {
        place += 1
        let text = `${place}. ${place} место: [${line.name}](${line.url}) ${line.entries.length} постов \n`
        out += text
    })
    fs.writeFileSync('posts.md', out)

    lines.sort((a, b) => {
        return Object.keys(b.donators).length - Object.keys(a.donators).length
    })
    place = 0
    out = ''
    lines.forEach(line => {
        place += 1
        let text = `${place}. ${place} место: [${line.name}](${line.url}) ${Object.keys(line.donators).length} донатеров \n`
        out += text
    })
    fs.writeFileSync('donators.md', out)
    entries.sort((a, b) => {
        return b.value - a.value
    })
    place = 0
    out = ''
    entries.forEach(entry => {
        place += 1
        let text = `${place}. ${place} место: [${entry.title}](${entry.url}) ${entry.value}₽ \n`
        out += text
    })
    fs.writeFileSync('entries.md', out)
}

let past = new Date()
past.setDate(1)
past.setHours(0)
past.setMinutes(0)
past.setSeconds(0)
past.setMilliseconds(0)
console.log('месяц')
getPanhandlers(past, monthURL).then((panhandlers) => {
    markdown(panhandlers)
    //console.log('3 мес')
    //getPanhandlers(past, threeMonthsURL).then((panhandlers) => {
    //  markdown(panhandlers)
    // past = new Date()
    // past.setMonth(past.getMonth() - 12)
    //console.log('год')
    //getPanhandlers(past, allURL).then(() => { IP BAN
    //})
    //})
})
