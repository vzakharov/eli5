<template>

  <b-container class="mt-5">
    <b-row>
      <b-col
        class="text-center font-weight-bold"
        :style="{ 
          fontSize: '1.5em',
          maxWidth: '600px',
          margin: '0 auto'
        }"
      >
        <h1 class="display-4">
          Explain like I’m five!
          <!-- Favicon -->
        </h1>
        <p class="lead">
          This is a simple tool to explain anything to your kids. Or to yourself, for that matter.
        </p>
        <!-- Query form -->
        <b-form
          class="mt-5"
          @submit.prevent="submit"
        >
          <!-- Query input -->
          <b-form-group 
            label="What’s on your mind?"
            label-for="query"
          >
            <b-input
              id="query"
              v-model="query"
              placeholder="A term, a question, anything, basically."
              style="margin: auto; font-size: 1em; font-weight: light;"
            />
          </b-form-group>
          <!-- Submit -->
          <b-button
            type="submit"
            class="mt-3"
            :disabled="!query"
            variant="primary"
            size="lg"
          >
            Explain like I’m five!
          </b-button>
        </b-form>
        <!-- Spinner if thinking -->
        <b-spinner
          class="mt-3"
          v-if="thinking"
          type="grow"
          variant="primary"
        />
        <!-- Response in a div if there is one -->
        <div
          v-else-if="response"
        >
          <div
            id="response"
            class="my-5"
          >
            <component 
              v-for="bit, i in response.split(/\b/)"
              :key="i"
              :is="
                // <nuxt-link> if word, span otherwise
                bit.match(/^\w+$/) ? 'nuxt-link' : 'span'
              "
              :to="bit.match(/^\w+$/) ? { query: { q: bit }} : undefined"
              v-text="bit"
            />
          </div>
          <!-- Small text -->
          <div
            v-if="!settings.hintShown"
            class="mt-3 text-muted font-weight-light"
            style="font-size: 0.8em"
          >
            👆 Click on any word to explain it!
          </div>
        </div>
      </b-col>
    </b-row>
    <!-- Buy me a beer link, fixed at the bottom right -->
    <div
      style="position: fixed; bottom: 10px; right: 10px; z-index: 1;"
    >
      <a 
        href="https://vzakharov.github.io/buy-me-a-beer" target="_blank"
        style="text-decoration: none; color: #ccc;"
      >
        Buy me a 🍺
      </a>
    </div>
    <!-- Buy me a beer modal, shown is this.suggestToPay is true -->
    <b-modal
      id="buy-me-a-beer"
      title="Enjoying ELI5?"
      v-model="suggestToPay"
      hide-footer
    >
      <p>Seems like you’re really enjoying this tool, and that’s great!</p>
      <p>While the tool is free for you, it actually costs me some money to send the requests to the API.</p>
      <p>So if you want to support me, you can do this here:</p>
      <b-button
        variant="primary"
        size="lg"
        href="https://vzakharov.github.io/buy-me-a-beer"
        target="_blank"
      >
        Buy me a 🍺
      </b-button>
      <p class="mt-3">Thank you!</p>
    </b-modal>
  </b-container>

</template>

<script>

  import axios from 'axios'
  import Notion from '~/plugins/notion'

  export default {

    head() {
      return {
        title: ( this.query ? `${this.query} · ` : '' ) + 'Explain like I’m five!',
        meta: [
          {
            name: 'description',
            content: 'A simple tool to explain anything to your kids. Or to yourself, for that matter.'
          }
        ]
      }
    },
    
    data() {

      return {

        settings: {
          hintShown: false,
          numQueries: 0
        },

        query: '',
        thinking: false,
        response: null,
        suggestToPay: false

      }

    },

    mounted() {

      // Load settings from local storage; watch for changes to write back
      this.settings = {
        ...this.settings,
        ...JSON.parse(localStorage.getItem('settings') || '{}'),
      }

      this.$watch('settings', settings =>
        localStorage.setItem('settings', JSON.stringify(settings))
      , { deep: true })

      // Watch $route.query.q for changes and run right away if it's present
      this.$watch('$route.query.q', {
        immediate: true,
        handler(query) {
          if (query) {
            this.query = query
            this.run()
          }
        }
      })

    },

    methods: {

      async getToxicity(query) {

        let prompt = `<|endoftext|>${query}\n--\nLabel:`

        try {

          let { data: { choices: [{ text: toxicity }]}} = await axios.post(
            'https://api.openai.com/v1/engines/content-filter-alpha/completions',
            {
              prompt: `<|endoftext|>${prompt}\n--\nLabel:`,
              temperature: 0,
              top_p: 0,
              max_tokens: 1,
              logprobs: 10
            },
            {
              headers: {
                'Authorization': `Bearer ${this.settings.apiKey}`
              }
            }
          )

          // Convert safety label to number
          return Number(toxicity.trim())

        } catch (error) {
          
          console.error(error)

          return 2

        }

      },

      async run() {

        this.thinking = true

        try {

          // First, check if there's already a response stored on Notion ( queryDatabase by the name)
          let [ { response } = {} ] = await Notion.anon.queryDatabase(process.env.NOTION_DATABASE_ID, {
            filter: {
              property: 'Name',
              title: {
                equals: this.query.toLowerCase()
              }
            }
          })

          if ( response ) {
            this.thinking = false
            return this.response = response
          }

        } catch (error) {

          console.error(error)

        }

        let { query } = this

        try {

          // Run the request and check toxicity at the same time
          let { data: { response }} = await axios.post(
            process.env.ELI5_API_URL,
            { query }
          )


          // Post the response to Notion (don't wait for it)
          Notion.anon.createPage({
            parent: {
              database_id: process.env.NOTION_DATABASE_ID,
            },
            properties: {
              name: this.query.toLowerCase(),
              response
            }
          })

          this.settings.numQueries++
          // Every 20th query, set suggestToPay to true
          if ( this.settings.numQueries % 20 === 0 ) {
            this.suggestToPay = true
          }

          this.response = response

        } catch (error) {
          
          console.error(error)

          // Show a toast
          this.$bvToast.toast(
            `Error: ${error.response?.data.error || error.message}`,
            {
              title: 'Error',
              variant: 'danger',
              solid: true,
              autoHideDelay: 5000
            }
          )

        } finally {

          this.thinking = false

        }

      },

      async submit() {
        // Update route query and run
        this.$router.push({ query: { q: this.query }})
      },

    },

    watch: {

      response(response) {

        if ( response && !this.settings.hintShown) {

          // Blink using settings.hintShown a few times, then set to true
          let blinkInterval = setInterval(() => {
            this.settings.hintShown = !this.settings.hintShown
          }, 500)

          setTimeout(() => {
            clearInterval(blinkInterval)
            this.settings.hintShown = true
          }, 3000)

        }


      }
    }

  }

</script>

<style scoped>
  
    /* Undecorated links for #response */
    #response a {
      text-decoration: none;
      color: inherit;
      cursor: pointer!important;
    }

</style>