import { Context, runInContext } from 'vm'

export default async function (context: Context, element: HTMLElement) {
  let shouldHide = !!runInContext(element.getAttribute(':hide') || 'false', context)
  element.removeAttribute(':hide')
  if (shouldHide) element.style.display = 'none'
}