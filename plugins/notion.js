// Various methods to work with Notion API

// axios
import axios from 'axios'

// lodash
import { 
  chain, camelCase, upperFirst, keys
} from 'lodash'

function Notion(token) {

  let api = axios.create({
    baseURL: process.env.NOTION_API_URL,
    headers: {
      ...token ? {
        Authorization: `Bearer ${token}`
      } : {}
    }
  })
  
  Object.assign(this, {

    // Create page
    async createPage({ parent, properties, content }) {

      let {
        data
      } = await api.post('pages', {
        parent,
        properties: chain(properties)
          .mapValues(( value, key ) => {

            // If string, wrap in { X: [{ text: { content: value }}]}, where X is 'title' if key is 'name', and 'rich_text' otherwise
            if ( typeof value === 'string' ) {
              return {
                [ 
                  key === 'name' ? 'title' : 'rich_text'
                ]: [{
                  text: {
                    content: value
                  }
                }]
              }
            }

            // If number, wrap in { number: value }
            if ( typeof value === 'number' ) {
              return {
                number: value
              }
            }

          })
          .mapKeys(( value, key ) =>
            // Upper first + space between every lower and upper letter
            upperFirst(key)
            .replace(/([a-z])([A-Z])/g, '$1 $2')
          )
          .value()
      })

      denotionize(data)

      return data

    },

    // Get page
    async getPage(id) {

      let {
        data
      } = await api.get(`pages/${id}`)

      denotionize(data)

      return data

    },

    // Get token owner info
    async getUser() {

      // If no token, throw error
      if ( !token ) {
        throw new Error('No token provided. Please use an instance of Notion with a token.')
      }

      return (
        await api.get('users/me')
      ).data

    },

    // query a database
    async queryDatabase(databaseId, query) {
      return (
        await api.post(`databases/${databaseId}/query`, query)
      ).data.results.map( result => {
        let { properties, ...details } = result
        denotionize(result)
        return {
          ...result.properties,
          details
        }
      })
    },

    // get a block
    async getBlock(blockId, { recurse = false } = {}) {

      let { data, data: { has_children } } = await api.get(`blocks/${blockId}`)

      if ( has_children ) {
        data.children = await this.getBlockChildren(blockId, { recurse })
      }

      return data

    },

    // get block children
    async getBlockChildren(blockId, { recurse = false } = {}) {

      let { data: { results }} = await api.get(`blocks/${blockId}/children`)

      if ( recurse )
        await Promise.all(
          results.map( async result => {
            let { has_children } = result
            if ( has_children ) {
              result.children = await this.getBlockChildren(result.id, { recurse })
            }
            return result
          })
        )
      
      return results

    }
        

  })

}

function denotionize(data, key = 'properties') {

  data[key] = chain(data[key])
    .mapKeys( ( value, key ) => camelCase(key) )
    .mapValues( ( object, key ) => {

      const extract = object =>
        object?.type ?
          extract(object[object.type]) :
          object

      let value = extract(object)
      // console.log({ object, value })

      if ( ['title', 'rich_text'].includes(object.type) ) {
        value = value[0]?.plain_text
      }

      return value

    } )
    .value()

}

Notion.anon = new Notion()

export default Notion