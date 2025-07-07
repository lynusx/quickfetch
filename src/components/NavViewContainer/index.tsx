import { Route, Routes, Navigate } from 'react-router'

import ImageCopy from '../../pages/ImageCopyPage'
import ExcelParse from '../../pages/ExcelParsePage'

const NavViewContainer = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/image-copy" replace />} />
      <Route path="/image-copy" element={<ImageCopy />} />
      <Route path="/excel-parse" element={<ExcelParse />} />
    </Routes>
  )
}

export default NavViewContainer
