import { Template, parseFile, step/* , getData */ } from './helpers'
import extend from './helpers/extend'
import { getMixins } from './helpers/mixin'
import { minify, Options } from 'html-minifier'
import { Client } from '@horsepower/server'
import * as vm from 'vm'
import { Form, Data } from './classes'

export interface TemplateData {
  originalData: { [key: string]: any }
  scopes: {
    reference: string
    data: { [key: string]: any }
  }[]
}

export type Nullable<T> = T | null | undefined

export class horsepowerTemplate {

  private templateData: TemplateData
  private readonly client: Client

  private constructor(client: Client, options: TemplateData) {
    this.client = client
    this.templateData = options
  }

  /**
   * Builds the Template
   *
   * @param {Template} tpl The template to build
   * @returns {Promise<Template>} The rebuilt template
   * @memberof horsepowerTemplate
   */
  public async build(tpl: Template): Promise<Template> {
    let rootTpl = await extend(tpl)
    let mixins = getMixins(rootTpl)
    await step(this.client, rootTpl, rootTpl.document, this.templateData, mixins)
    if (rootTpl.document.documentElement) {
      let context = vm.createContext(this.templateData.originalData)
      rootTpl.document.documentElement.innerHTML =
        rootTpl.document.documentElement.innerHTML
          .replace(/\{\{(.+?)\}\}/gms, (full, val) => vm.runInContext(val, context)) //getData(val, this.templateData))
    }
    return rootTpl
  }

  /**
   * Renders a template
   *
   * @static
   * @param {string} file The starting file to render
   * @param {object} [data={}] The template data
   * @param {Options} [minifyOptions] Options to minify the output using [html-minifier](https://www.npmjs.com/package/html-minifier#options-quick-reference)
   * @returns {Promise<string>}
   * @memberof horsepowerTemplate
   */
  public static async render(client: Client, data: object = {}, minifyOptions?: Options): Promise<string> {
    try {
      data = Object.assign(data, { Form: new Form(data as Data) })
      let file = client.response.templatePath
      if (!file) return ''
      let templateData: TemplateData = { originalData: {}, scopes: [] }
      templateData.originalData = Object.assign<object, object>(templateData.originalData, data)
      let hpTpl = new horsepowerTemplate(client, templateData)
      let html = (await hpTpl.build(await parseFile(file))).dom.serialize()

      let defaultMinifyOptions = {
        collapseWhitespace: true,
        collapseBooleanAttributes: true,
        decodeEntities: true,
        removeAttributeQuotes: true,
        removeComments: true,
        removeEmptyAttributes: true,
        removeOptionalTags: true,
        removeRedundantAttributes: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true,
        useShortDoctype: true,
        minifyCSS: true,
        minifyJS: true
      }

      return minify(html, minifyOptions ? Object.assign(defaultMinifyOptions, minifyOptions) : defaultMinifyOptions)
    } catch (e) {
      throw e
    }
  }
}