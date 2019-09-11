import { Context, runInContext } from 'vm'

export default async function (context: Context, element: HTMLElement) {
  let classes = runInContext('__hpClassContext =' + element.getAttribute(':class') || '{}', context)
  delete context['__hpClassContext']
  let classesToShow: string[] = []
  Object.entries(classes).forEach(i => !!i[1] && classesToShow.push(i[0]))
  element.classList.add(...classesToShow)
  element.removeAttribute(':class')
}