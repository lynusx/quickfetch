import { Theme } from '@radix-ui/themes'
import ImageCopyPage from './pages/image-copy'

function App() {
  return (
    <Theme
      appearance="light"
      accentColor="blue"
      radius="large"
      panelBackground="solid"
    >
      <ImageCopyPage />
    </Theme>
  )
}

export default App
