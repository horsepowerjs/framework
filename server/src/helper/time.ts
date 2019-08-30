export function localTime(utcDate: Date | number, timeZone: string, locale: string = 'en-US') {
  let theDate = typeof utcDate == 'number' ? new Date(utcDate) : utcDate
  return theDate.toLocaleTimeString(locale, { timeZone })
}

export function localDate(utcDate: Date | number, timeZone: string, locale: string = 'en-US') {
  let theDate = typeof utcDate == 'number' ? new Date(utcDate) : utcDate
  return theDate.toLocaleDateString(locale, { timeZone })
}

export function localDateTime(utcDate: Date | number, timeZone: string, locale: string = 'en-US') {
  let theDate = typeof utcDate == 'number' ? new Date(utcDate) : utcDate
  return theDate.toLocaleString(locale, { timeZone })
}

export function age(startDate: Date | string | number, endDate?: Date) {
  endDate = endDate instanceof Date ? endDate : new Date
  startDate = startDate instanceof Date ? startDate : new Date(startDate)
  let age = new Date(endDate.getTime() - startDate.getTime())
  return Math.abs(age.getUTCFullYear() - 1970)
}

export function ago(startDate: Date | string | number, endDate?: Date) {
  endDate = endDate instanceof Date ? endDate : new Date
  startDate = startDate instanceof Date ? startDate : new Date(startDate)
  let seconds = (endDate.getTime() - startDate.getTime()) / 1000
  let result = ''
  if (seconds > 31535965.4396976) {
    result = Math.floor(seconds / 31535965.4396976) + ' years ago'
  } else if (seconds > 2.628e+6) {
    result = Math.floor(seconds / 2.628e+6) + ' months ago'
  } else if (seconds > 86400) {
    result = Math.floor(seconds / 86400) + ' days ago'
  } else if (seconds > 3600) {
    result = Math.floor(seconds / 3600) + ' hours ago'
  } else if (seconds > 60) {
    result = Math.floor(seconds / 60) + ' minutes ago'
  } else {
    result = Math.floor(seconds) + ' seconds ago'
  }
  return result.replace(/(.+) (.+) (.+)/, (full, time, word, ago) => `${time} ${time == 1 ? word.replace(/s$/, '') : word} ${ago}`)
}