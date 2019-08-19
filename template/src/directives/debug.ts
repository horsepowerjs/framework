import { replaceVariables } from '../helpers'
import { TemplateData } from '..'
import { isProduction } from '@horsepower/server'

// <debug log="{{$test}}"></debug>
// <debug info="test"></debug>
// <debug error="test"></debug>
// <debug warn="test"></debug>

// add the `no-eval` flag to disable evaluation of the data
// <debug log="{{$a}} == {{$b}}" no-eval></debug>

// add the `prod` flag to allow debugging to output within production mode
// <debug log="{{$a}} == {{$b}}" prod></debug>

// TODO: Add support for self closing tag: `<debug ... />`, currently this breaks the application
// TODO: Either make the `eval` more secure or find a way to remove the usage of `eval`
export default async function (element: Element, data: TemplateData) {
  // If this is production do not debug just remove the element unless the element has the prod flag
  if (isProduction() && !element.hasAttribute('prod')) return element.remove()

  // get the data to write to the console
  let log = element.getAttribute('log')
  let info = element.getAttribute('info')
  let warn = element.getAttribute('warn')
  let error = element.getAttribute('error')

  // Should the data be evaluated to a single result, or should we just replace the variables?
  // no-eval will disable evaluation and just log the string
  let shouldEval = !element.hasAttribute('no-eval')

  // Remove the element so it doesn't display in the output
  element.remove()

  // log everything
  if (log) console.log(dataToLog(shouldEval, log, data))
  if (info) console.info(dataToLog(shouldEval, info, data))
  if (warn) console.warn(dataToLog(shouldEval, warn, data))
  if (error) console.error(dataToLog(shouldEval, error, data))
}

function dataToLog(shouldEval: boolean, string: string, data: any) {
  string = replaceVariables(string, data)
  if (shouldEval) {
    try {
      return eval(string)
    } catch (e) {
      return string
    }
  }
  return string
}