import * as path from 'path'
import * as fs from 'fs'
import * as helpers from './helper'
import { Client } from '.'
import { horsepowerTemplate } from '@horsepower/template'
import { Storage } from '@horsepower/storage'

export interface pug {
  renderFile(path: string, options?: {}, callback?: Function): string
}
export interface mustache {
  render(path: string, options?: {}, callback?: Function): string
}
export interface handlebars {
  compile(path: string, options?: {}, callback?: Function): string
}

export class Template {

  private static _root: string = ''

  public static get root(): string { return this._root }

  public static setTemplatesRoot(path: string) {
    this._root = path
  }

  public static async render(client: Client) {
    let html = ''
    if (typeof client.response.templatePath == 'string') {
      let filePath = client.response.templatePath
      let options = Object.assign({}, client.response.templateData, helpers, {
        get: client.data.getAll,
        post: client.data.postAll,
        request: client.data.requestAll,
        session: client.session as import('@horsepower/session').Session,
        params: client.route.params
      })
      let file = path.join(this._root, filePath)
      // Render horsepower files
      if (filePath.endsWith('.mix')) {
        html = await horsepowerTemplate.render(client, options)
      }
      // Render pug files
      else if (filePath.endsWith('.pug')) {
        const pug: pug = require.main && require.main.require('pug')
        if (pug) {
          html = pug.renderFile(file, options)
        }
      }
      // Render mustache files
      else if (filePath.endsWith('.mustache')) {
        const mustache: mustache = require.main && require.main.require('mustache')
        if (mustache) {
          let data = await new Promise<string>(resolve => fs.readFile(file, (err, data) => resolve(data.toString())))
          html = mustache.render(data, options)
        }
      }
      // Render handlebars files
      else if (filePath.endsWith('.hbs')) {
        const handlebars: handlebars = require.main && require.main.require('handlebars')
        if (handlebars) {
          let data = await new Promise<string>(resolve => fs.readFile(file, (err, data) => resolve(data.toString())))
          html = handlebars.compile(data, options)
        }
      }
      // Render other files that have been called via render
      // This just loads the and sets the content-type based on the extension
      // this includes html, txt, csv, etc
      else {
        html = (await Storage.mount('resources').read(path.join('views', filePath)) || '').toString()
        // html = await new Promise<string>(resolve => fs.readFile(file, (err, result) => resolve((result || '').toString())))
      }
    }
    return html
  }
}