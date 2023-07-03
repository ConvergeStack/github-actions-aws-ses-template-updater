/**
 * Set this to true when testing on local.
 * This sets the github action variables.
 */
const SIMULATING_ON_LOCAL = false

const CORE = require('@actions/core')
const FS = require('fs')
const MINIFY = require('html-minifier').minify
const SES_SDK = require('@aws-sdk/client-ses')

/**
 * Returns the variable set on Github
 * @param {string} inputKey
 * @returns {string}
 */
const getGithubActionInputValue = function (inputKey) {
  if (SIMULATING_ON_LOCAL) {
    return getGithubActionInputValueSimulating(inputKey)
  }
  const value = CORE.getInput(inputKey)
  if (value === '') {
    throw new Error(
      `Invalid ${inputKey}: did you forget to set it in your action config?`
    )
  }
  return value
}

/**
 * Only to use for getGithubActionInputValue() for local env use
 * @param {string} inputKey
 * @returns {string}
 */
const getGithubActionInputValueSimulating = function (inputKey) {
  switch (inputKey) {
    case 'templateName':
      return 'UserAccountDeleted'
    case 'subjectFilePath':
      return 'ses/templates/UserAccountDeleted/subject.txt'
    case 'htmlBodyFilePath':
      return 'ses/templates/UserAccountDeleted/email.html'
    case 'rawBodyFilePath':
      return 'ses/templates/UserAccountDeleted/email.txt'
    case 'sesRegion':
      return 'us-east-1'
    default:
      throw new Error(
        `Invalid ${inputKey}: did you forget to set it in getGithubActionInputValueSimulating()`
      )
  }
}

/**
 * Reads file content on provided path and returns it as string
 * @param {string} filePath
 * @returns {string}
 */
const getFileContents = function (filePath) {
  return FS.readFileSync(filePath, 'utf8')
}

/**
 * Initialize SES Client
 */
const SES_CLIENT = new SES_SDK.SESClient(
  SIMULATING_ON_LOCAL
    ? {
        region: getGithubActionInputValue('sesRegion')
      }
    : {
        region: getGithubActionInputValue('sesRegion'),
        credentials: {
          accessKeyId: getGithubActionInputValue('awsAccessKey'),
          secretAccessKey: getGithubActionInputValue('awsSecretKey')
        }
      }
)

/**
 * Returns current template data on AWS SES
 * @param {string} templateName
 */
const getTemplateFromAwsSes = async function (templateName) {
  const existingTemplate = await SES_CLIENT.send(
    new SES_SDK.GetTemplateCommand({
      TemplateName: templateName
    })
  )

  return existingTemplate
}

const updateTemplateOnAwsSes = async function (
  TemplateName,
  SubjectPart,
  TextPart,
  HtmlPart
) {
  const existingTemplates = await SES_CLIENT.send(
    new SES_SDK.ListTemplatesCommand({})
  )

  const templateExistsIndex = existingTemplates.TemplatesMetadata.findIndex(
    (template) => template.Name === TemplateName
  )

  if (templateExistsIndex === -1) {
    await SES_CLIENT.send(
      new SES_SDK.CreateTemplateCommand({
        Template: { TemplateName, HtmlPart, SubjectPart, TextPart }
      })
    )
  } else {
    CORE.info(
      'Template on AWS SES before updating: ' +
        JSON.stringify((await getTemplateFromAwsSes(TemplateName)).Template)
    )
    await SES_CLIENT.send(
      new SES_SDK.UpdateTemplateCommand({
        Template: { TemplateName, HtmlPart, SubjectPart, TextPart }
      })
    )
  }
}

/**
 * Entry point of this file
 */
async function run () {
  const templateName = getGithubActionInputValue('templateName')
  const subjectFile = getFileContents(
    getGithubActionInputValue('subjectFilePath')
  )
  const rawBody = getFileContents(getGithubActionInputValue('rawBodyFilePath'))
  const htmlBody = MINIFY(
    getFileContents(getGithubActionInputValue('htmlBodyFilePath')),
    {
      collapseWhitespace: true,
      minifyCSS: true,
      minifyJS: true
    }
  )

  await updateTemplateOnAwsSes(templateName, subjectFile, rawBody, htmlBody)
  CORE.info(
    'Template on AWS SES after updating: ' +
      JSON.stringify((await getTemplateFromAwsSes(templateName)).Template)
  )
}

/**
 * Calls the entry function of this file.
 */
run().catch((e) => {
  CORE.setFailed(e.message)
  throw e
})
