import { Route, Routes, Navigate } from 'react-router'

import ImageCopyPage from '../image-copy'
import ExcelParsePage from '../excel-parse'

const NavViewContainer = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/image-copy" replace />} />
      <Route path="/image-copy" element={<ImageCopyPage />} />
      <Route path="/excel-parse" element={<ExcelParsePage />} />
    </Routes>
  )
}

export default NavViewContainer
