import { Flex, Spinner, Text } from '@radix-ui/themes'

const Loading = () => {
  return (
    <Flex
      height="100vh"
      align="center"
      justify="center"
      direction="column"
      gap="4"
    >
      <Spinner size="3" />
      <Text size="4" color="blue" weight="medium">
        页面加载中，请稍候...
      </Text>
    </Flex>
  )
}

export default Loading
