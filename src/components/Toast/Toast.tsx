import * as RadixToast from '@radix-ui/react-toast'
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion'
import { clsx } from 'clsx'
import { Card, Text, Flex, IconButton } from '@radix-ui/themes'
import React from 'react'

const textColor: Record<string, { color: 'blue' | 'jade' | 'red' }> = {
  info: { color: 'blue' },
  success: { color: 'jade' },
  error: { color: 'red' },
}

export interface ToastProps {
  open: boolean
  setOpen: (open: boolean) => void
  title: React.ReactNode
  description: React.ReactNode
  type?: 'info' | 'success' | 'error'
}

export function Toast({
  open,
  setOpen,
  title,
  description,
  type = 'info',
}: ToastProps) {
  const color = textColor[type]?.color

  return (
    <RadixToast.Provider swipeDirection="right">
      <AnimatePresence>
        {open && (
          <RadixToast.Root
            className={clsx('fixed bottom-4 right-4 z-50')}
            open={open}
            onOpenChange={setOpen}
            asChild
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
            >
              <Card size="2" style={{ minWidth: '300px' }}>
                <Flex justify="between" gap="3">
                  <Flex gap="2" align="start" direction="column">
                    <Text as="div" size="2" weight="bold" mb="1" color={color}>
                      {title}
                    </Text>
                    <Text as="div" size="2" color={color}>
                      {description}
                    </Text>
                  </Flex>
                  <RadixToast.Close asChild>
                    <IconButton size="1" variant="ghost" color="gray">
                      ✕
                    </IconButton>
                  </RadixToast.Close>
                </Flex>
              </Card>
            </motion.div>
          </RadixToast.Root>
        )}
      </AnimatePresence>
      <RadixToast.Viewport />
    </RadixToast.Provider>
  )
}
