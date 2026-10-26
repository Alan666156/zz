import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { installRouteErrorHandler } from './router/route-load-error'
import './styles/global.css'

const app = createApp(App)
app.use(createPinia())
installRouteErrorHandler(router)
app.use(router)
app.mount('#app')
