import { Template } from '../../helpers/extend'
import { Client } from '@horsepower/server'
import { Context } from 'vm'

export default async function (context: Context, client: Client, root: Template, element: Element) {
  if (element.ownerDocument && client.session) {
    const input = element.ownerDocument.createElement('input') as HTMLInputElement
    input.type = 'hidden'
    input.name = 'csrf'
    input.value = client.session.csrf || ''
    element.replaceWith(input)
  } else {
    element.remove()
  }
}