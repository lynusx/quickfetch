import { Theme } from '@radix-ui/themes'
import Home from './pages/home'

function App() {
  return (
    <Theme appearance="light" accentColor="blue" radius="large" panelBackground="solid">
      <Home />
    </Theme>
  )
}

export default App